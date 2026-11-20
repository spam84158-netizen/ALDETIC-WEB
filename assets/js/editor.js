/* ALDETIC — Éditeur de projet : fichiers, onglets, numéros de ligne, coloration, recherche, enregistrement versionné, historique.
   Toute écriture passe par les fonctions serveur project_file_save / rename / delete (propriétaire, version attendue, taille, chemin). */
document.addEventListener("aldetic:ready", async () => {
  const db = window.aldeticDb, $ = id => document.getElementById(id);
  const say = t => { $("state").textContent = t; $("state").hidden = !t; };
  const ERR = { forbidden: "Action non autorisée sur ce projet.", archived: "Projet archivé : lecture seule.", invalid_path: "Nom de fichier invalide (lettres, chiffres, . _ - /).", too_large: "Fichier trop volumineux (500 000 caractères maximum).", too_many_files: "Limite de 200 fichiers atteinte.", exists: "Un fichier porte déjà ce nom.", not_found: "Fichier introuvable.", conflict: "Ce fichier a été modifié ailleurs. Rechargez-le avant d'enregistrer." };
  const params = new URLSearchParams(location.search), pid = params.get("p");
  if (!db) { say(tr("Le service de comptes n'est pas configuré.")); return; }
  const { data: sess } = await db.auth.getSession();
  if (!sess || !sess.session) { location.href = "connexion.html"; return; }
  const me = sess.session.user.id;
  if (!pid) { location.href = "projets.html"; return; }

  // ---------- coloration syntaxique ----------
  const KW = {
    js: "const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of null true false undefined this super yield delete void static get set",
    py: "def class return if elif else for while in not and or is None True False import from as with try except finally raise lambda pass break continue yield global async await self",
    sql: "select from where insert into values update set delete create table alter drop index view function returns return begin end as and or not null primary key references on join left right inner group by order limit offset having union distinct case when then else if exists default unique check"
  };
  const kwRe = l => new RegExp("\\b(?:" + KW[l].split(" ").join("|") + ")\\b", l === "sql" ? "gi" : "g");
  const LANGS = { js: "js", mjs: "js", ts: "js", jsx: "js", json: "json", css: "css", html: "html", htm: "html", xml: "html", svg: "html", py: "py", sql: "sql", md: "text", txt: "text" };
  const langOf = p => LANGS[(p.split(".").pop() || "").toLowerCase()] || "text";
  const escH = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  function highlight(code, lang) {
    let rules;
    if (lang === "html") rules = [["c", /<!--[\s\S]*?-->/], ["s", /"[^"\n]*"|'[^'\n]*'/], ["t", /<\/?[A-Za-z][\w:-]*|\/?>/]];
    else if (lang === "css") rules = [["c", /\/\*[\s\S]*?\*\//], ["s", /"[^"\n]*"|'[^'\n]*'/], ["n", /#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms)?\b/]];
    else if (lang === "js" || lang === "json") rules = [["c", /\/\/[^\n]*|\/\*[\s\S]*?\*\//], ["s", /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/], ["n", /\b\d+(?:\.\d+)?\b/], ...(lang === "js" ? [["k", kwRe("js")]] : [["k", /\b(?:true|false|null)\b/]])];
    else if (lang === "py") rules = [["c", /#[^\n]*/], ["s", /"""[\s\S]*?"""|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/], ["n", /\b\d+(?:\.\d+)?\b/], ["k", kwRe("py")]];
    else if (lang === "sql") rules = [["c", /--[^\n]*|\/\*[\s\S]*?\*\//], ["s", /'(?:''|[^'])*'/], ["n", /\b\d+(?:\.\d+)?\b/], ["k", kwRe("sql")]];
    else return escH(code);
    const re = new RegExp(rules.map(r => "(" + r[1].source + ")").join("|"), "gi".replace(lang === "sql" ? "" : "i", ""));
    let out = "", last = 0, m;
    while ((m = re.exec(code))) {
      if (m[0] === "") { re.lastIndex++; continue; }
      let g = 1; while (m[g] === undefined) g++;
      out += escH(code.slice(last, m.index)) + `<span class="tk-${rules[g - 1][0]}">${escH(m[0])}</span>`; last = m.index + m[0].length;
    }
    return out + escH(code.slice(last));
  }

  // ---------- état ----------
  let project = null, files = [], tabs = [], cur = null, canWrite = false, busy = false;
  const ta = $("ed-ta"), hl = $("ed-hl"), gut = $("ed-gutter");
  const tab = p => tabs.find(t => t.path === p);
  const toast2 = t => { $("ed-status").textContent = t; };
  const dirty = () => tabs.some(t => t.dirty);
  window.addEventListener("beforeunload", e => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });

  function paint() {
    const t = cur && tab(cur); const code = t ? t.content : "";
    hl.innerHTML = highlight(code, t ? langOf(t.path) : "text") + "\n";
    const n = code.split("\n").length; let g = ""; for (let i = 1; i <= n; i++) g += i + "\n"; gut.textContent = g;
    syncScroll();
  }
  function syncScroll() { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; gut.scrollTop = ta.scrollTop; }
  function drawTabs() {
    $("ed-tabs").innerHTML = tabs.map(t => `<button type="button" class="ed-tab" role="tab" aria-selected="${t.path === cur}" data-tab="${esc(t.path)}">${esc(t.path.split("/").pop())}${t.dirty ? " ●" : ""}<span class="ed-x" data-close="${esc(t.path)}" aria-label="${esc(tr("Fermer"))}">×</span></button>`).join("");
    $("ed-empty").hidden = !!cur; $("ed-box").hidden = !cur;
    $("ed-save").disabled = !(cur && tab(cur) && tab(cur).dirty && canWrite);
  }
  function drawTree() {
    $("ed-tree").innerHTML = files.length ? files.map(f => `<li><button type="button" class="ed-file" data-open="${esc(f.path)}" aria-current="${f.path === cur}">${esc(f.path)}</button></li>`).join("") : `<li class="muted" style="padding:8px">${esc(tr("Aucun fichier. Créez-en un."))}</li>`;
  }
  function show() { const t = cur && tab(cur); ta.value = t ? t.content : ""; ta.readOnly = !canWrite; paint(); drawTabs(); drawTree(); $("ed-lang").textContent = t ? langOf(t.path) : ""; hist.hidden = true; }

  async function loadFiles() {
    const { data, error } = await db.from("project_files").select("id, path, version").eq("project_id", pid).order("path");
    if (error) { say(tr("Impossible de charger les fichiers.")); return false; }
    files = data || []; return true;
  }
  async function openFile(path) {
    if (!tab(path)) {
      const { data, error } = await db.from("project_files").select("content, version").eq("project_id", pid).eq("path", path).maybeSingle();
      if (error || !data) { toast2(tr(ERR.not_found)); return; }
      tabs.push({ path, content: data.content, saved: data.content, version: data.version, dirty: false });
    }
    cur = path; show(); toast2("");
  }
  function closeTab(path) {
    const t = tab(path); if (t && t.dirty && !confirm(tr("Fermer sans enregistrer les modifications ?"))) return;
    tabs = tabs.filter(x => x.path !== path); if (cur === path) cur = tabs.length ? tabs[tabs.length - 1].path : null; show();
  }
  async function save() {
    const t = cur && tab(cur); if (!t || !t.dirty || !canWrite || busy) return;
    busy = true; $("ed-save").disabled = true; toast2(tr("Enregistrement…"));
    const { data: r, error } = await db.rpc("project_file_save", { p_project: pid, p_path: t.path, p_content: t.content, p_expected: t.version });
    busy = false;
    if (error || !r) { toast2(tr("Enregistrement impossible. Réessayez.")); drawTabs(); return; }
    if (!r.ok) { toast2(tr(ERR[r.reason] || "Enregistrement refusé.")); drawTabs(); return; }
    t.version = r.version; t.saved = t.content; t.dirty = false; toast2(tr("Enregistré") + " · v" + r.version); drawTabs(); await loadFiles(); drawTree();
  }
  async function newFile(name) {
    name = name.trim(); if (!name) return;
    const { data: r, error } = await db.rpc("project_file_save", { p_project: pid, p_path: name, p_content: "", p_expected: null });
    if (error || !r || !r.ok) { toast2(tr(ERR[(r && r.reason)] || "Création impossible.")); return; }
    await loadFiles(); await openFile(name);
  }
  async function renameFile(from, to) {
    to = to.trim(); if (!to || to === from) return;
    const { data: r, error } = await db.rpc("project_file_rename", { p_project: pid, p_from: from, p_to: to });
    if (error || !r || !r.ok) { toast2(tr(ERR[(r && r.reason)] || "Renommage impossible.")); return; }
    const t = tab(from); if (t) { t.path = to; if (cur === from) cur = to; }
    await loadFiles(); show();
  }
  async function deleteFile(path) {
    if (!confirm(tr("Supprimer ce fichier et son historique ?"))) return;
    const { data: r, error } = await db.rpc("project_file_delete", { p_project: pid, p_path: path });
    if (error || !r || !r.ok) { toast2(tr(ERR[(r && r.reason)] || "Suppression impossible.")); return; }
    tabs = tabs.filter(x => x.path !== path); if (cur === path) cur = tabs.length ? tabs[tabs.length - 1].path : null;
    await loadFiles(); show();
  }

  // ---------- historique ----------
  const hist = $("ed-hist");
  async function openHistory() {
    const t = cur && tab(cur), f = t && files.find(x => x.path === t.path); if (!f) return;
    const { data, error } = await db.from("project_versions").select("version, created_at").eq("file_id", f.id).order("version", { ascending: false }).limit(50);
    if (error) { toast2(tr("Historique indisponible.")); return; }
    hist.hidden = false;
    $("ed-hist-list").innerHTML = (data || []).map(v => `<li><span><b>v${v.version}</b> <small>${esc(new Date(v.created_at).toLocaleString(document.documentElement.lang))}</small></span>${canWrite ? `<button type="button" class="btn small ghost" data-restore="${v.version}" data-file="${esc(f.id)}">${esc(tr("Charger"))}</button>` : ""}</li>`).join("") || `<li class="muted">${esc(tr("Aucune version."))}</li>`;
  }
  hist.addEventListener("click", async e => {
    const b = e.target.closest("[data-restore]"); if (!b) return;
    const { data } = await db.from("project_versions").select("content").eq("file_id", b.dataset.file).eq("version", Number(b.dataset.restore)).maybeSingle();
    const t = cur && tab(cur); if (!data || !t) return;
    t.content = data.content; t.dirty = t.content !== t.saved; ta.value = t.content; paint(); drawTabs();
    toast2(tr("Version chargée. Enregistrez pour la restaurer."));
  });

  // ---------- recherche ----------
  let hitPos = 0;
  function find(fromStart) {
    const q = $("ed-q").value; if (!q || !cur) { $("ed-hits").textContent = ""; return; }
    const hay = ta.value.toLowerCase(), needle = q.toLowerCase(); let count = 0, i = -1; while ((i = hay.indexOf(needle, i + 1)) !== -1) count++;
    $("ed-hits").textContent = count + " " + tr("résultat(s)");
    if (!count) return;
    let at = hay.indexOf(needle, fromStart ? 0 : hitPos); if (at === -1) at = hay.indexOf(needle, 0);
    ta.focus(); ta.setSelectionRange(at, at + q.length); hitPos = at + q.length;
    const line = ta.value.slice(0, at).split("\n").length - 1; ta.scrollTop = Math.max(0, line * 20 - 60);
    syncScroll();
  }

  // ---------- événements ----------
  ta.addEventListener("input", () => { const t = tab(cur); if (!t || !canWrite) return; t.content = ta.value; t.dirty = t.content !== t.saved; paint(); drawTabs(); });
  ta.addEventListener("scroll", syncScroll);
  ta.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); return; }
    if (e.key === "Tab" && canWrite) { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText("  ", s, ta.selectionEnd, "end"); ta.dispatchEvent(new Event("input")); }
  });
  $("ed-save").addEventListener("click", save);
  $("ed-tabs").addEventListener("click", e => { const c = e.target.closest("[data-close]"); if (c) { e.stopPropagation(); closeTab(c.dataset.close); return; } const t = e.target.closest("[data-tab]"); if (t) { cur = t.dataset.tab; show(); } });
  $("ed-tree").addEventListener("click", e => { const b = e.target.closest("[data-open]"); if (b) openFile(b.dataset.open); });
  $("ed-new").addEventListener("click", () => { $("ed-name-form").hidden = false; $("ed-name-form").dataset.mode = "new"; $("ed-name").value = ""; $("ed-name").focus(); });
  $("ed-rename").addEventListener("click", () => { if (!cur) return; $("ed-name-form").hidden = false; $("ed-name-form").dataset.mode = "rename"; $("ed-name").value = cur; $("ed-name").focus(); });
  $("ed-delete").addEventListener("click", () => { if (cur) deleteFile(cur); });
  $("ed-name-form").addEventListener("submit", async e => { e.preventDefault(); const mode = $("ed-name-form").dataset.mode, v = $("ed-name").value; $("ed-name-form").hidden = true; if (mode === "new") await newFile(v); else await renameFile(cur, v); });
  $("ed-history").addEventListener("click", openHistory);
  $("ed-q").addEventListener("input", () => find(true));
  $("ed-q").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); find(false); } });
  $("ed-next").addEventListener("click", () => find(false));

  // ---------- chargement ----------
  const { data: pr, error: pe } = await db.from("projects").select("id, owner_id, name, slug, visibility, status").eq("id", pid).maybeSingle();
  if (pe || !pr) { say(tr("Projet introuvable ou privé.")); return; }
  project = pr; canWrite = pr.owner_id === me && pr.status === "active";
  $("ed-title").textContent = pr.name;
  $("ed-mode").textContent = pr.status === "archived" ? tr("Archivé · lecture seule") : canWrite ? tr("Modification") : tr("Lecture seule");
  document.querySelectorAll("[data-writer]").forEach(el => { el.hidden = !canWrite; });
  $("ed-app").hidden = false;
  if (await loadFiles()) { drawTree(); show(); const first = files.find(f => /^(index\.html|README\.md)$/i.test(f.path)) || files[0]; if (first) await openFile(first.path); }
});
