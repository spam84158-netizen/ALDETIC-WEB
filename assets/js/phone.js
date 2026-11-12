/* Vérification du numéro. Aucun code n'est généré ni rempli automatiquement : l'envoi SMS
   demande un fournisseur (non branché). Tant qu'il n'existe pas, le numéro n'est jamais marqué vérifié. */

document.addEventListener("aldetic:ready", async () => {
  const db = window.aldeticDb;
  const country = document.getElementById("country"), phone = document.getElementById("phone");
  const stepPhone = document.getElementById("step-phone"), stepCode = document.getElementById("step-code");
  const wait = document.getElementById("wait");
  const sent = document.getElementById("sent"), cerr = document.getElementById("cerr");
  let userId = null;

  window.ALDETIC_COUNTRIES.forEach((c, i) => country.add(new Option(`${c.name} (+${c.dial})`, i)));
  country.value = window.ALDETIC_COUNTRIES.findIndex(c => c.dial === "33");

  if (db) {
    const { data } = await db.auth.getSession();
    if (!data.session) { location.href = "connexion.html"; return; }
    userId = data.session.user.id;
    const { data: p } = await db.from("profiles").select("phone_verified").eq("id", userId).single();
    if (p && p.phone_verified) { location.href = "tableau-de-bord.html"; return; }
  } else if (!alDemo.get("account", null)) {
    location.href = "connexion.html"; return;
  }

  const blocked = tr("Envoi du code indisponible : le fournisseur SMS n'est pas encore branché. Votre numéro n'est pas vérifié.");

  stepPhone.addEventListener("submit", async e => {
    e.preventDefault();
    const c = window.ALDETIC_COUNTRIES[country.value];
    const digits = phone.value.replace(/\D/g, "").replace(/^0/, "");
    const err = document.getElementById("perr");
    if (!/^\d+$/.test(digits) || digits.length < c.min || digits.length > c.max) {
      err.textContent = document.documentElement.lang === "en"
        ? `Invalid number for ${c.name}: ${c.min === c.max ? c.min : c.min + " to " + c.max} digits expected after the country code.`
        : `Numéro invalide pour ${c.name} : ${c.min === c.max ? c.min : c.min + " à " + c.max} chiffres attendus après l'indicatif.`;
      return;
    }
    err.textContent = "";
    const picked = `+${c.dial}${digits}`;
    if (db) {
      const { error } = await db.from("profiles").update({ phone: picked }).eq("id", userId);
      if (error) { err.textContent = tr("Enregistrement impossible : ") + error.message; return; }
    } else {
      alDemo.set("account", { ...alDemo.get("account", {}), phone: picked });
    }
    stepPhone.hidden = true; stepCode.hidden = false;
    sent.textContent = document.documentElement.lang === "en"
      ? `Number saved: ${picked}. The SMS code is not sent yet.`
      : `Numéro enregistré : ${picked}. Le code SMS n'est pas encore envoyé.`;
    wait.hidden = true;
    cerr.textContent = blocked;
  });

  // Aucun code n'existe encore à vérifier : le formulaire ne valide rien.
  stepCode.addEventListener("submit", e => { e.preventDefault(); cerr.textContent = blocked; });
});
