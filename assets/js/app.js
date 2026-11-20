/* Aldetic : langue, en-tête, pied de page, données de démonstration locales, petits utilitaires. */
(function () {
  const LANGS = ["fr", "en", "es", "pt", "de", "ar"];
  const NAV = [
    ["espace.html", "Espace", "Workspace"],
    ["services.html", "Services", "Services"],
    ["projets.html", "Projets", "Projects"],
    ["communaute.html", "Communauté", "Community"],
    ["git.html", "MY GIT", "MY GIT"],
    ["cloud.html", "MY CLOUD", "MY CLOUD"],
    ["chat.html", "AI CHAT", "AI CHAT"],
    ["api.html", "API CENTER", "API CENTER"],
    ["carrieres.html", "Carrières", "Careers"],
    ["portfolio.html", "Fondateur", "Founder"],
    ["tarifs.html", "Tarifs", "Pricing"],
    ["documentation.html", "Docs", "Docs"]
  ];

  // Langues réellement traduites. Les autres apparaissent dans le menu, désactivées, tant que leur traduction n'est pas complète.
  const AVAILABLE = ["fr", "en", "es", "pt", "de", "ar"];
  const LABEL = { fr: "Français", en: "English", es: "Español", pt: "Português", de: "Deutsch", ar: "العربية" };

  // Langue : choix manuel enregistré, sinon langues du navigateur (dans l'ordre), sinon anglais.
  function currentLang() {
    const saved = localStorage.getItem("aldetic-lang");
    if (saved && AVAILABLE.includes(saved)) return saved;
    const prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"])
      .map(l => l.slice(0, 2).toLowerCase());
    return prefs.find(c => AVAILABLE.includes(c)) || "en";
  }

  // Premier accès sans choix enregistré : l'utilisateur choisit sa langue, la détection n'est que proposée.
  // Textes : écrits en français dans le HTML. Traduction en via data-en ; autres langues via data-<code>.
  function translateTextNodes() {
    const dict = { en: window.ALDETIC_EN, es: window.ALDETIC_ES, pt: window.ALDETIC_PT, de: window.ALDETIC_DE, ar: window.ALDETIC_AR }[document.documentElement.lang] || {};
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.parentElement && !/^(SCRIPT|STYLE)$/.test(n.parentElement.tagName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      const key = n.textContent.trim();
      if (key && dict[key] !== undefined) n.textContent = n.textContent.replace(key, dict[key]);
    });
    document.querySelectorAll("[placeholder]").forEach(el => {
      const key = el.getAttribute("placeholder");
      if (dict[key] !== undefined) el.setAttribute("placeholder", dict[key]);
    });
    const parts = document.title.split(" · ");
    if (dict[parts[0]] !== undefined) document.title = [dict[parts[0]], ...parts.slice(1)].join(" · ");
  }

  function applyLang(lang) {
    document.documentElement.lang = lang;
    if (lang !== "fr") translateTextNodes();
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.body.dir = document.documentElement.dir;
    document.querySelectorAll("[data-en],[data-es],[data-pt],[data-de],[data-ar]").forEach(el => {
      if (!el.dataset.fr) el.dataset.fr = el.innerHTML;
      const v = el.dataset[lang] !== undefined ? el.dataset[lang] : (lang === "en" ? el.dataset.en || el.dataset.fr : el.dataset.fr);
      el.innerHTML = v;
    });
    document.querySelectorAll("[data-ph-en]").forEach(el => {
      if (!el.dataset.phFr) el.dataset.phFr = el.getAttribute("placeholder") || "";
      el.setAttribute("placeholder", lang === "fr" ? el.dataset.phFr : el.dataset.phEn);
    });
    const sel = document.getElementById("lang");
    if (sel) sel.value = lang;
  }

  function lbl(lang, fr, e) {
    const d = { en: window.ALDETIC_EN, es: window.ALDETIC_ES, pt: window.ALDETIC_PT, de: window.ALDETIC_DE, ar: window.ALDETIC_AR }[lang] || {};
    if (lang === "fr") return fr;
    if (lang === "en") return e;
    return d[fr] !== undefined ? d[fr] : fr;
  }

  function header(lang) {
    const current = location.pathname.split("/").pop() || "index.html";
    const en = lang !== "fr";
    const links = NAV.map(([href, fr, e]) =>
      `<a href="${href}" ${href === current ? 'aria-current="page"' : ""}>${lbl(lang, fr, e)}</a>`).join("");
    const opts = LANGS.map(c => AVAILABLE.includes(c)
      ? `<option value="${c}" ${c === lang ? "selected" : ""}>${LABEL[c]}</option>`
      : `<option value="${c}" disabled>${LABEL[c]}</option>`).join("");
    return `
      <header class="site-header"><div class="wrap bar">
        <a class="brand" href="index.html" aria-label="Aldetic Frontiers Ltd — accueil"><img class="brand-logo logo-light" src="assets/brand/logos/aldetic-logo.svg" alt="Aldetic Frontiers Ltd"><img class="brand-logo logo-dark" src="assets/brand/logos/aldetic-logo-dark.svg" alt="" aria-hidden="true"></a>
        <nav class="nav" id="nav">${links}<span class="sep"></span>
          <a href="connexion.html">${en ? "Log in" : tr("Connexion")}</a>
          <a class="btn small" href="inscription.html">${en ? "Sign up" : tr("Inscription")}</a>
          <button class="theme-btn" id="theme" type="button" aria-label="Theme"></button>
          <select class="lang" id="lang" aria-label="Language">${opts}</select>
        </nav>
        <button class="menu-btn" id="menu" aria-label="Menu" aria-expanded="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      </div></header>`;
  }

  function footer(lang) {
    const en = lang !== "fr";
    return `
      <footer class="site-footer"><div class="wrap">
        <div class="foot-grid">
          <div><a href="index.html" aria-label="Accueil Aldetic"><img class="logo-light" src="assets/brand/logos/aldetic-logo.svg" alt="Aldetic Frontiers Ltd" style="width:190px;height:auto;margin:0 0 12px"><img class="logo-dark" src="assets/brand/logos/aldetic-logo-dark.svg" alt="" aria-hidden="true" style="width:190px;height:auto;margin:0 0 12px"></a>
            <p>${en ? "Technology Beyond Limits" : "Technology Beyond Limits"}<br>${en ? "Innovate. Develop. Build the future." : "Innover. Développer. Bâtir l'avenir."}</p></div>
          <div><h3>${en ? "Platform" : "Plateforme"}</h3><ul><li><a href="espace.html">${en ? "Workspace" : "Espace"}</a></li><li><a href="aide.html">${en ? "Help Center" : "Centre d’aide"}</a></li><li><a href="notifications.html">${en ? "Notifications" : "Notifications"}</a></li><li><a href="statut.html">${en ? "Status" : "Statut"}</a></li><li><a href="services.html">${en ? tr("Services") : tr("Services")}</a></li><li><a href="git.html">MY GIT</a></li><li><a href="cloud.html">MY CLOUD</a></li><li><a href="api.html">API CENTER</a></li></ul></div>
          <div><h3>${en ? "Company" : "Entreprise"}</h3><ul><li><a href="a-propos.html">${en ? "About" : tr("À propos")}</a></li><li><a href="carrieres.html">${en ? "Careers" : tr("Carrières")}</a></li><li><a href="contact.html">Contact</a></li></ul></div>
          <div><h3>${en ? "Legal" : "Légal"}</h3><ul><li><a href="conditions.html">${en ? "Terms of use" : tr("Conditions d'utilisation")}</a></li><li><a href="confidentialite.html">${en ? "Privacy" : tr("Confidentialité")}</a></li><li><a href="tarifs.html">${en ? "Pricing" : tr("Tarifs")}</a></li></ul></div>
        </div>
        <div class="foot-bottom"><span>© 2026 Aldetic Frontiers Ltd</span><span>${en ? "Language follows your browser; you can change it in the menu." : "La langue suit votre navigateur ; vous pouvez la changer dans le menu."}</span></div>
      </div></footer>`;
  }

  // Données locales de rien n'est envoyé à un serveur tant que la base n'est pas connectée.
  window.alDemo = {
    get(key, fallback) {
      try { const v = localStorage.getItem("aldetic-demo:" + key); return v ? JSON.parse(v) : fallback; }
      catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem("aldetic-demo:" + key, JSON.stringify(value)); } catch (e) {} }
  };

  window.toast = function (msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
  };

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  window.esc = escapeHtml;

  function wireUi() {
    const menu = document.getElementById("menu");
    const nav = document.getElementById("nav");
    if (menu && nav) menu.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      menu.setAttribute("aria-expanded", String(open));
    });
    document.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(b.dataset.copy); toast(document.documentElement.lang === "fr" ? "Copié" : "Copied"); }
      catch (e) { toast(tr("Copie impossible : sélectionnez le texte")); }
    }));
    document.querySelectorAll("[data-tabs]").forEach(group => {
      const tabs = group.querySelectorAll("[role=tab]");
      tabs.forEach(tab => tab.addEventListener("click", () => {
        tabs.forEach(t => { t.setAttribute("aria-selected", String(t === tab)); document.getElementById(t.getAttribute("aria-controls")).hidden = t !== tab; });
      }));
    });
    if (document.body.dataset.protected === "true") gateProtected();
  }

  // Accès aux pages connectées : session ET numéro vérifié.
  async function gateProtected() {
    const db = window.aldeticDb;
    if (!db) {
      if (!alDemo.get("account", null)) return location.href = "connexion.html";
      if (!alDemo.get("phone_verified", false)) return location.href = "verification-telephone.html";
      return;
    }
    const { data } = await db.auth.getSession();
    if (!data.session) return location.href = "connexion.html";
    const { data: prof } = await db.from("profiles").select("phone_verified").eq("id", data.session.user.id).single();
    if (!prof || !prof.phone_verified) location.href = "verification-telephone.html";
  }


  // Thème : système → clair → sombre, mémorisé sur l'appareil.
  const THEMES = ["system", "light", "dark"];
  const themeLabel = { system: "◐ Auto", light: "☀ Clair", dark: " Sombre" };
  function applyTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    const b = document.getElementById("theme");
    if (b) { b.textContent = themeLabel[t]; b.setAttribute("aria-label", "Theme: " + t); }
  }
  function wireTheme() {
    let t = "system"; try { t = localStorage.getItem("aldetic-theme") || "system"; } catch (e) {}
    if (!THEMES.includes(t)) t = "system";
    applyTheme(t);
    const b = document.getElementById("theme");
    if (b) b.addEventListener("click", () => { t = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]; try { localStorage.setItem("aldetic-theme", t); } catch (e) {} applyTheme(t); });
  }


  // Barre de navigation mobile flottante (affichée par le CSS sur téléphone uniquement)
  function bottomNav(lang) {
    if (document.querySelector(".bnav")) return;
    const cur = location.pathname.split("/").pop() || "index.html", en = lang !== "fr";
    const ic = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
    const item = (href, label, d) => `<a href="${href}" ${cur === href ? 'aria-current="page"' : ""}>${ic(d)}<span>${label}</span></a>`;
    const nav = document.createElement("nav");
    nav.className = "bnav"; nav.setAttribute("aria-label", en ? "Quick navigation" : "Navigation rapide");
    nav.innerHTML = item("espace.html", en ? "Home" : "Espace", '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>') +
      item("communaute.html", en ? "Community" : "Communauté", '<path d="M5 6h14v10H9l-4 3z"/>') +
      `<a class="bn-main" href="projets.html" aria-label="${en ? "New project" : "Nouveau projet"}"><span class="c">${ic('<path d="M12 5v14M5 12h14"/>')}</span><span>${en ? "New" : "Créer"}</span></a>` +
      item("portefeuille.html", en ? "Wallet" : "Portefeuille", '<rect x="3.5" y="6.5" width="17" height="12" rx="2.5"/><path d="M16 12.5h4.5"/>') +
      `<button class="bn bn-menu" type="button" aria-label="Menu">${ic('<path d="M4 7h16M4 12h16M4 17h16"/>')}<span>Menu</span></button>`;
    document.body.appendChild(nav);
    nav.querySelector(".bn-menu").addEventListener("click", () => { const m = document.getElementById("menu"); if (m) m.click(); });
  }

  function init() {
    const lang = currentLang();
    const hdr = document.getElementById("site-header");
    const ftr = document.getElementById("site-footer");
    if (hdr) hdr.innerHTML = header(lang);
    if (ftr) ftr.innerHTML = footer(lang);
    applyLang(lang);
    // Pas de fenêtre bloquante : la langue est détectée, et le sélecteur de la barre de navigation permet de la changer.
    const sel = document.getElementById("lang");
    if (sel) sel.addEventListener("change", e => { localStorage.setItem("aldetic-lang", e.target.value); location.reload(); });
    wireUi();
    wireTheme();
    bottomNav(lang);
    if (window.alMotion) window.alMotion();
    document.dispatchEvent(new CustomEvent("aldetic:ready", { detail: { lang } }));
  }
  document.addEventListener("DOMContentLoaded", init);
})();
