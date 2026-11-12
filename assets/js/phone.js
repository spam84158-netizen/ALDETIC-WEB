/* Aldetic — vérification téléphonique simulée (démo).
   Un code fictif aléatoire à 6 chiffres est généré après 5 secondes,
   rempli automatiquement puis validé. Aucun SMS réel n'est envoyé. */
document.addEventListener("aldetic:ready", async () => {
  const db = window.aldeticDb;
  const country = document.getElementById("country"), phone = document.getElementById("phone");
  const stepPhone = document.getElementById("step-phone"), stepCode = document.getElementById("step-code");
  const wait = document.getElementById("wait"), sent = document.getElementById("sent");
  const codeInput = document.getElementById("code"), cerr = document.getElementById("cerr");
  let userId = null, busy = false, generatedDemoCode = null;

  window.ALDETIC_COUNTRIES.forEach((c, i) => country.add(new Option(`${c.name} (+${c.dial})`, i)));
  const ci = window.ALDETIC_COUNTRIES.findIndex(c => c.dial === "225");
  country.value = String(ci >= 0 ? ci : Math.max(0, window.ALDETIC_COUNTRIES.findIndex(c => c.dial === "33")));

  if (db) {
    const { data, error } = await db.auth.getSession();
    if (error || !data.session) { location.href = "connexion.html"; return; }
    userId = data.session.user.id;
    const { data: profile } = await db.from("profiles").select("phone_verified").eq("id", userId).maybeSingle();
    if (profile?.phone_verified) { location.href = "tableau-de-bord.html"; return; }
  } else if (!window.alDemo?.get("account", null)) {
    location.href = "connexion.html"; return;
  }

  async function confirmDemo() {
    if (busy) return; busy = true;
    cerr.textContent = tr("Confirmation simulée en cours…");
    if (db) {
      const { error } = await db.rpc("aldetic_confirm_demo_phone");
      if (error) {
        cerr.textContent = tr("La confirmation simulée est prête, mais la fonction SQL doit être installée : ") + error.message;
        busy = false; return;
      }
    } else {
      const account = window.alDemo.get("account", {});
      window.alDemo.set("account", { ...account, phone_verified: true });
    }
    cerr.textContent = tr("Numéro confirmé en mode démonstration. Aucun SMS réel n'a été envoyé.");
    setTimeout(() => location.replace("tableau-de-bord.html"), 900);
  }

  stepPhone.addEventListener("submit", async e => {
    e.preventDefault();
    const c = window.ALDETIC_COUNTRIES[Number(country.value)];
    const digits = phone.value.replace(/\D/g, "").replace(/^0/, "");
    const err = document.getElementById("perr");
    if (!c || !/^\d+$/.test(digits) || digits.length < c.min || digits.length > c.max) {
      err.textContent = tr("Numéro invalide pour le pays choisi."); return;
    }
    err.textContent = "";
    const picked = `+${c.dial}${digits}`;
    if (db) {
      const { error } = await db.from("profiles").update({ phone: picked }).eq("id", userId);
      if (error) { err.textContent = tr("Enregistrement impossible : ") + error.message; return; }
    } else {
      window.alDemo.set("account", { ...window.alDemo.get("account", {}), phone: picked });
    }
    stepPhone.hidden = true; stepCode.hidden = false; wait.hidden = false;
    sent.textContent = tr("Numéro enregistré : ") + picked + ". " + tr("Code de démonstration automatique dans 5 secondes.");
    codeInput.value = ""; codeInput.disabled = true;
    setTimeout(async () => {
      // Code de démonstration aléatoire : il n'est ni fixe ni envoyé par SMS.
      const bytes = new Uint32Array(1);
      crypto.getRandomValues(bytes);
      generatedDemoCode = String(bytes[0] % 1000000).padStart(6, "0");
      codeInput.value = generatedDemoCode;
      codeInput.disabled = false;
      wait.hidden = true;
      await confirmDemo();
    }, 5000);
  });
  stepCode.addEventListener("submit", async e => {
    e.preventDefault();
    if (!generatedDemoCode || codeInput.value !== generatedDemoCode) { cerr.textContent = tr("Code de démonstration incorrect."); return; }
    await confirmDemo();
  });
});
