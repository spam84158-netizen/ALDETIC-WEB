/* ALDETIC — Vérification téléphonique par code de démonstration.
   Délai : 5 secondes. Code aléatoire à 6 chiffres.
   La confirmation Supabase est effectuée par RPC côté serveur.
*/

document.addEventListener("aldetic:ready", async () => {
  const db = window.aldeticDb;

  const country = document.getElementById("country");
  const phone = document.getElementById("phone");
  const stepPhone = document.getElementById("step-phone");
  const stepCode = document.getElementById("step-code");
  const wait = document.getElementById("wait");
  const sent = document.getElementById("sent");
  const cerr = document.getElementById("cerr");
  const perr = document.getElementById("perr");
  const codeInput = document.getElementById("code");

  const submitPhone = stepPhone.querySelector('button[type="submit"]');
  const submitCode = stepCode.querySelector('button[type="submit"]');

  let userId = null;
  let currentCode = null;
  let processing = false;

  const isEnglish = () => document.documentElement.lang === "en";

  const message = (fr, en) => isEnglish() ? en : fr;

  const delay = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  const randomCode = () => {
    const values = new Uint32Array(1);

    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(values);
      return String(100000 + (values[0] % 900000));
    }

    return String(Math.floor(100000 + Math.random() * 900000));
  };

  window.ALDETIC_COUNTRIES.forEach((c, i) => {
    country.add(new Option(`${c.name} (+${c.dial})`, i));
  });

  country.value = window.ALDETIC_COUNTRIES.findIndex(
    c => c.dial === "33"
  );

  if (db) {
    const { data, error } = await db.auth.getSession();

    if (error || !data.session) {
      location.href = "connexion.html";
      return;
    }

    userId = data.session.user.id;

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("phone_verified")
      .eq("id", userId)
      .single();

    if (profileError) {
      perr.textContent = message(
        "Impossible de récupérer votre profil : " + profileError.message,
        "Unable to retrieve your profile: " + profileError.message
      );
      return;
    }

    if (profile && profile.phone_verified) {
      location.href = "tableau-de-bord.html";
      return;
    }
  } else if (!window.alDemo.get("account", null)) {
    location.href = "connexion.html";
    return;
  }

  async function confirmCode(code) {
    if (db) {
      const { data, error } = await db.rpc(
        "aldetic_confirm_demo_phone",
        { p_code: code }
      );

      if (error) {
        throw new Error(error.message);
      }

      if (data !== true) {
        throw new Error(message(
          "Le code n'a pas pu être confirmé.",
          "The code could not be confirmed."
        ));
      }
    } else {
      const account = window.alDemo.get("account", {});

      if (account.phone !== window.alDemo.get("pending_phone", "")) {
        throw new Error(message(
          "Le numéro enregistré ne correspond plus.",
          "The saved phone number no longer matches."
        ));
      }

      if (code !== currentCode) {
        throw new Error(message(
          "Code incorrect.",
          "Incorrect code."
        ));
      }

      window.alDemo.set("phone_verified", true);
      window.alDemo.set("account", {
        ...account,
        phone_verified: true
      });
    }

    cerr.textContent = message(
      "Numéro confirmé avec succès. Redirection…",
      "Phone number confirmed successfully. Redirecting…"
    );

    await delay(1200);
    location.href = "tableau-de-bord.html";
  }

  stepPhone.addEventListener("submit", async event => {
    event.preventDefault();

    if (processing) return;

    const selectedCountry = window.ALDETIC_COUNTRIES[country.value];

    if (!selectedCountry) return;

    const digits = phone.value
      .replace(/\D/g, "")
      .replace(/^0/, "");

    if (
      !/^\d+$/.test(digits) ||
      digits.length < selectedCountry.min ||
      digits.length > selectedCountry.max
    ) {
      perr.textContent = message(
        `Numéro invalide pour ${selectedCountry.name} : ${selectedCountry.min === selectedCountry.max
          ? selectedCountry.min
          : selectedCountry.min + " à " + selectedCountry.max} chiffres attendus.`,
        `Invalid number for ${selectedCountry.name}: ${selectedCountry.min === selectedCountry.max
          ? selectedCountry.min
          : selectedCountry.min + " to " + selectedCountry.max} digits expected.`
      );
      return;
    }

    perr.textContent = "";
    cerr.textContent = "";

    const picked = `+${selectedCountry.dial}${digits}`;

    processing = true;
    submitPhone.disabled = true;
    wait.hidden = false;
    stepPhone.hidden = true;
    stepCode.hidden = false;

    sent.textContent = message(
      "Préparation de votre code de vérification…",
      "Preparing your verification code…"
    );

    try {
      // Attente exacte de 5 secondes avant la génération du code.
      await delay(5000);

      if (db) {
        const { data, error } = await db.rpc(
          "aldetic_generate_demo_phone_code",
          { p_phone: picked }
        );

        if (error) {
          throw new Error(error.message);
        }

        currentCode = String(data || "");

        if (!/^\d{6}$/.test(currentCode)) {
          throw new Error(message(
            "Le serveur n'a pas généré un code valide.",
            "The server did not generate a valid code."
          ));
        }
      } else {
        currentCode = randomCode();

        const account = window.alDemo.get("account", {});

        window.alDemo.set("account", {
          ...account,
          phone: picked
        });

        window.alDemo.set("pending_phone", picked);
      }

      // Remplissage automatique du champ.
      codeInput.value = currentCode;

      wait.hidden = true;

      sent.textContent = message(
        `Code ${picked}. Confirmation automatique en cours…`,
        `code generated for ${picked}. Automatic confirmation in progress…`
      );

      // Confirmation automatique du code généré.
      await confirmCode(currentCode);

    } catch (error) {
      wait.hidden = true;
      cerr.textContent = message(
        "Erreur de vérification : ",
        "Verification error: "
      ) + error.message;

      stepPhone.hidden = false;
      stepCode.hidden = false;
      submitPhone.disabled = false;
      processing = false;
    }
  });

  // Possibilité de valider manuellement si nécessaire.
  stepCode.addEventListener("submit", async event => {
    event.preventDefault();

    if (processing) return;

    const enteredCode = codeInput.value.trim();

    if (!/^\d{6}$/.test(enteredCode)) {
      cerr.textContent = message(
        "Saisissez un code de 6 chiffres.",
        "Enter a 6-digit code."
      );
      return;
    }

    processing = true;
    submitCode.disabled = true;
    cerr.textContent = "";

    try {
      await confirmCode(enteredCode);
    } catch (error) {
      cerr.textContent = message(
        "Confirmation impossible : ",
        "Confirmation failed: "
      ) + error.message;

      processing = false;
      submitCode.disabled = false;
    }
  });
});