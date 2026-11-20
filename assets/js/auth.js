/* Aldetic — authentification et orientation par rôle Supabase.
   Le rôle est lu dans public.user_roles (user_id, role), jamais déduit de l'e-mail côté navigateur. */
(() => {
  const OWNER_EMAIL = "yureijianyu@gmail.com";
  const LOGIN_PAGE = "connexion.html";
  const USER_HOME = "tableau-de-bord.html";
  const OWNER_HOME = "super-admin.html";

  const db = () => window.aldeticDb;
  const show = (message, cls = "warn") => {
    const msg = document.getElementById("auth-msg");
    if (msg) {
      msg.textContent = message;
      msg.className = "notice" + (cls ? " " + cls : "");
      msg.hidden = false;
    } else if (typeof window.toast === "function") window.toast(message);
  };

  async function getRole(user) {
    if (!db() || !user) return null;
    const { data, error } = await db().from("user_roles")
      .select("role").eq("user_id", user.id);
    if (error) throw error;
    const roles = (data || []).map(row => String(row.role).toLowerCase());
    // Le rôle owner doit provenir de la table protégée, pas d'une comparaison d'e-mail.
    return roles.includes("owner") ? "owner" : (roles[0] || "user");
  }

  async function destination(user) {
    const role = await getRole(user);
    return role === "owner" ? OWNER_HOME : USER_HOME;
  }

  async function routeConnectedUser() {
    const client = db();
    if (!client) return;
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return;
    const target = await destination(user);
    const current = location.pathname.split("/").pop() || "index.html";
    if (current === LOGIN_PAGE || current === USER_HOME && target === OWNER_HOME || current === OWNER_HOME && target !== OWNER_HOME) {
      if (current !== target) location.replace(target);
    }
  }

  async function protectOwnerPage() {
    const current = location.pathname.split("/").pop();
    if (current !== OWNER_HOME) return;
    if (!db()) return location.replace(LOGIN_PAGE);
    const { data: { user }, error } = await db().auth.getUser();
    if (error || !user) return location.replace(LOGIN_PAGE);
    try {
      if (await getRole(user) !== "owner") location.replace(USER_HOME);
    } catch (err) {
      console.error("Vérification du rôle owner impossible:", err);
      show("Impossible de vérifier les autorisations administrateur. Accès refusé.");
      location.replace(USER_HOME);
    }
  }

  document.addEventListener("aldetic:ready", async () => {
    const form = document.getElementById("auth-form");
    if (form) {
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const email = form.elements.email.value.trim();
        const password = form.elements.password.value;
        const signup = form.dataset.mode === "signup";
        if (!db()) return show("Authentification indisponible : vérifiez la configuration Supabase.");
        const result = signup
          ? await db().auth.signUp({ email, password })
          : await db().auth.signInWithPassword({ email, password });
        if (result.error) return show(result.error.message);
        if (signup && !result.data.session) return show("Compte créé. Confirmez votre adresse e-mail, puis connectez-vous.", "");
        if (signup) return location.replace("verification-telephone.html");
        try {
          location.replace(await destination(result.data.user));
        } catch (err) {
          console.error("Lecture du rôle impossible:", err);
          show("Connexion réussie, mais le rôle du compte n'a pas pu être vérifié. Vérifiez les autorisations de user_roles.");
        }
      });
    }

    document.querySelectorAll("[data-oauth]").forEach(button => button.addEventListener("click", async () => {
      if (!db()) return show("Connexion externe indisponible : vérifiez la configuration Supabase.");
      const { error } = await db().auth.signInWithOAuth({
        provider: button.dataset.oauth,
        options: { redirectTo: new URL("tableau-de-bord.html", location.href).href }
      });
      if (error) show(error.message);
    }));

    // Parrainage : mémorise ?ref=CODE puis l'attribue côté serveur dès qu'une session existe (une seule tentative).
    try {
      const q = new URLSearchParams(location.search).get("ref");
      if (q && /^[A-Za-z0-9]{4,16}$/.test(q)) localStorage.setItem("aldetic_ref", q.toUpperCase());
      const stored = localStorage.getItem("aldetic_ref");
      if (stored && db()) {
        const { data: sess } = await db().auth.getSession();
        if (sess && sess.session) {
          const { error } = await db().rpc("referral_claim", { p_code: stored });
          if (!error) localStorage.removeItem("aldetic_ref");
        }
      }
    } catch (err) { console.error("Parrainage:", err); }

    try {
      await routeConnectedUser();
      await protectOwnerPage();
    } catch (err) {
      console.error("Contrôle d'accès Aldetic:", err);
    }
  });
})();
