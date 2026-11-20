/* ALDETIC — Vérification téléphonique en mode simulation gratuit.
   Le serveur génère le code après 3 secondes ; Supabase vérifie le code avant de confirmer le profil.
   Cette simulation ne prouve pas la possession physique du numéro : aucun SMS n’est envoyé. */
document.addEventListener("aldetic:ready", async () => {
  const db = window.aldeticDb;
  const $ = id => document.getElementById(id);
  const country = $("country"), phone = $("phone"), stepPhone = $("step-phone"), stepCode = $("step-code");
  const wait = $("wait"), sent = $("sent"), cerr = $("cerr"), perr = $("perr"), codeInput = $("code");
  const demoBox = $("demo-code-box"), demoCode = $("demo-code"), copyCode = $("copy-code");
  const submitPhone = stepPhone.querySelector('button[type="submit"]');
  const submitCode = stepCode.querySelector('button[type="submit"]');
  const en = () => document.documentElement.lang === "en";
  const t = (fr, e) => en() ? e : fr;
  let busy = false;

  const ERRORS = {
    sms_provider_not_configured: ["Le mode de simulation n'est pas disponible.", "Simulation mode is unavailable."],
    sms_delivery_failed: ["La génération du code a échoué. Réessayez.", "Code generation failed. Please try again."],
    too_soon: ["Patientez 30 secondes avant de redemander un code.", "Wait 30 seconds before requesting another code."],
    rate_limited: ["Trop de demandes. Réessayez plus tard.", "Too many requests. Try again later."],
    phone_taken: ["Ce numéro est déjà associé à un autre compte.", "This number is already linked to another account."],
    invalid_phone: ["Numéro invalide.", "Invalid number."],
    invalid_code_format: ["Saisissez un code de 6 chiffres.", "Enter a 6-digit code."],
    invalid_code: ["Code incorrect.", "Incorrect code."],
    expired: ["Le code a expiré. Demandez-en un nouveau.", "The code has expired. Request a new one."],
    too_many_attempts: ["Trop de tentatives. Demandez un nouveau code.", "Too many attempts. Request a new code."],
    no_pending: ["Aucun code en attente. Demandez-en un.", "No pending code. Request one."],
    auth_required: ["Connexion requise.", "Sign-in required."],
    invalid_session: ["Session invalide. Reconnectez-vous.", "Invalid session. Please sign in again."],
    server_not_configured: ["Le service de vérification n'est pas configuré.", "The verification service is not configured."]
  };
  const explain = code => { const m = ERRORS[code]; return m ? t(m[0], m[1]) : t("Erreur de vérification. Réessayez.", "Verification error. Please try again."); };

  async function call(body) {
    const { data, error } = await db.functions.invoke("phone-otp", { body });
    if (!error) return data || {};
    let payload = {};
    try { payload = await error.context.json(); } catch (_) {}
    const e = new Error(payload.error || "network"); e.code = payload.error || "network"; e.left = payload.attempts_left; throw e;
  }

  window.ALDETIC_COUNTRIES.forEach((c, i) => country.add(new Option(`${c.name} (+${c.dial})`, i)));
  country.value = window.ALDETIC_COUNTRIES.findIndex(c => c.dial === "33");

  if (!db) { perr.textContent = t("Le service de comptes n'est pas configuré.", "The account service is not configured."); submitPhone.disabled = true; return; }
  const { data: s, error: se } = await db.auth.getSession();
  if (se || !s.session) { location.href = "connexion.html"; return; }
  const { data: profile, error: pe } = await db.from("profiles").select("phone_verified").eq("id", s.session.user.id).single();
  if (pe) { perr.textContent = t("Impossible de récupérer votre profil.", "Unable to retrieve your profile."); return; }
  if (profile && profile.phone_verified) { location.href = "tableau-de-bord.html"; return; }

  stepPhone.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (busy) return;
    const c = window.ALDETIC_COUNTRIES[country.value];
    if (!c) return;
    const digits = phone.value.replace(/\D/g, "").replace(/^0/, "");
    if (digits.length < c.min || digits.length > c.max) {
      perr.textContent = t(`Numéro invalide pour ${c.name}.`, `Invalid number for ${c.name}.`);
      return;
    }
    perr.textContent = ""; cerr.textContent = "";
    const picked = `+${c.dial}${digits}`;
    busy = true; submitPhone.disabled = true; wait.hidden = false;
    try {
      const result = await call({ action: "send", phone: picked });
      wait.hidden = true; stepPhone.hidden = true; stepCode.hidden = false;
      sent.textContent = t(`Code généré pour ${picked}. Aucun SMS .`, `code generated for ${picked}.`);
      demoCode.textContent = result.demo_code || "------";
      demoBox.hidden = false;
      codeInput.value = result.demo_code || ""; codeInput.focus();
    } catch (e) {
      wait.hidden = true; perr.textContent = explain(e.code);
    } finally { busy = false; submitPhone.disabled = false; }
  });

  copyCode.addEventListener("click", async () => {
    const value = demoCode.textContent.trim();
    if (!/^\d{6}$/.test(value)) return;
    try { await navigator.clipboard.writeText(value); copyCode.textContent = t("Copié", "Copied"); }
    catch (_) { codeInput.focus(); codeInput.select(); }
  });

  stepCode.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (busy) return;
    const code = codeInput.value.trim();
    if (!/^\d{6}$/.test(code)) { cerr.textContent = explain("invalid_code_format"); return; }
    busy = true; submitCode.disabled = true; cerr.textContent = "";
    try {
      await call({ action: "verify", code });
      cerr.textContent = t("Code correct : numéro enregistré Redirection…", "Correct code: number . Redirecting…");
      setTimeout(() => { location.href = "tableau-de-bord.html"; }, 800);
    } catch (e) {
      cerr.textContent = explain(e.code) + (e.code === "invalid_code" && e.left != null ? ` (${e.left})` : "");
      if (["expired", "too_many_attempts", "no_pending"].includes(e.code)) { stepCode.hidden = true; stepPhone.hidden = false; }
    } finally { busy = false; submitCode.disabled = false; }
  });
});
