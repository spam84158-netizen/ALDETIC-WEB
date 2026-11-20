/* ALDETIC — Terminal de projet : explorez vos projets, fichiers et versions en ligne de commande (lecture seule).
   Pas de shell système : chaque commande est une requête contrôlée sur vos projets ; l'écriture se fait dans l'éditeur. */
document.addEventListener("aldetic:ready", async () => {
  const db = window.aldeticDb, $ = id => document.getElementById(id);
  const out = $("tm-out"), input = $("tm-in"), promptEl = $("tm-prompt");
  const say = t => { $("state").textContent = t; $("state").hidden = !t; };
  if (!db) { say(tr("Le service de comptes n'est pas configuré.")); return; }
  const { data: sess } = await db.auth.getSession();
  if (!sess || !sess.session) { location.href = "connexion.html"; return; }
  const me = sess.session.user.id;
  $("tm-app").hidden = false;
  let project = null, history = [], hpos = 0;
  const MAXLINES = 400;

  const print = (text, cls) => { const d = document.createElement("div"); d.className = "tm-line" + (cls ? " " + cls : ""); d.textContent = text; out.appendChild(d); out.scrollTop = out.scrollHeight; };
  const setPrompt = () => { promptEl.textContent = "aldetic:" + (project ? project.slug : "~") + "$"; };
  const split = line => { const re = /"([^"]*)"|'([^']*)'|(\S+)/g; const a = []; let m; while ((m = re.exec(line))) a.push(m[1] ?? m[2] ?? m[3]); return a; };
  const need = () => { if (!project) { print(tr("Aucun projet sélectionné. Tapez : projects puis use <nom>"), "tm-err"); return false; } return true; };
  const fileList = async () => { const { data, error } = await db.from("project_files").select("id, path, version").eq("project_id", project.id).order("path"); if (error) throw new Error("db"); return data || []; };
  const fileOf = async p => { const { data } = await db.from("project_files").select("id, path, content, version").eq("project_id", project.id).eq("path", p).maybeSingle(); return data; };
  const clip = lines => lines.length > MAXLINES ? lines.slice(0, MAXLINES).concat(["… (" + (lines.length - MAXLINES) + " " + tr("lignes de plus") + ")"]) : lines;

  const CMD = {
    help() {
      ["help                    " + tr("liste des commandes"), "projects                " + tr("vos projets"), "use <nom|id>            " + tr("choisir un projet"), "ls [dossier]            " + tr("fichiers"), "tree                    " + tr("arborescence"),
       "cat <fichier>           " + tr("afficher un fichier"), "head <fichier> [n]      " + tr("n premières lignes (10 par défaut)"), "grep <texte>            " + tr("chercher dans tous les fichiers"), "wc <fichier>            " + tr("lignes, mots, caractères"),
       "versions <fichier>      " + tr("historique des versions"), "stats                   " + tr("résumé du projet"), "whoami                  " + tr("compte connecté"), "history | clear | date"].forEach(l => print(l));
    },
    async projects() {
      const { data, error } = await db.from("projects").select("id, slug, name, status, visibility, owner_id").order("updated_at", { ascending: false }).limit(100);
      if (error) return print(tr("Lecture impossible."), "tm-err");
      (data || []).forEach(p => print(p.slug.padEnd(24) + (p.owner_id === me ? tr("à moi") : tr("public")).padEnd(8) + p.status + " / " + p.visibility));
      if (!(data || []).length) print(tr("Aucun projet."));
    },
    async use(a) {
      if (!a[0]) return print("use <nom|id>", "tm-err");
      const { data } = await db.from("projects").select("id, slug, name, owner_id, status").order("updated_at", { ascending: false }).limit(200);
      const p = (data || []).find(x => x.slug === a[0] || x.id === a[0]);
      if (!p) return print(tr("Projet introuvable :") + " " + a[0], "tm-err");
      project = p; setPrompt(); print(tr("Projet") + " " + p.name);
    },
    async ls(a) {
      if (!need()) return; const pre = (a[0] || "").replace(/^\/+/, "");
      const f = (await fileList()).filter(x => x.path.startsWith(pre)); f.forEach(x => print(("v" + x.version).padEnd(6) + x.path)); if (!f.length) print(tr("Aucun fichier."));
    },
    async tree() {
      if (!need()) return; const f = await fileList(); const seen = new Set();
      f.forEach(x => { const parts = x.path.split("/"); parts.forEach((p, i) => { const key = parts.slice(0, i + 1).join("/"); if (!seen.has(key)) { seen.add(key); print("  ".repeat(i) + (i < parts.length - 1 ? p + "/" : p)); } }); });
      if (!f.length) print(tr("Aucun fichier."));
    },
    async cat(a) {
      if (!need()) return; if (!a[0]) return print("cat <fichier>", "tm-err"); const f = await fileOf(a[0]); if (!f) return print(tr("Fichier introuvable :") + " " + a[0], "tm-err");
      clip(f.content.split("\n")).forEach(l => print(l));
    },
    async head(a) {
      if (!need()) return; if (!a[0]) return print("head <fichier> [n]", "tm-err"); const n = Math.min(Math.max(parseInt(a[1], 10) || 10, 1), 200); const f = await fileOf(a[0]); if (!f) return print(tr("Fichier introuvable :") + " " + a[0], "tm-err");
      f.content.split("\n").slice(0, n).forEach(l => print(l));
    },
    async wc(a) {
      if (!need()) return; if (!a[0]) return print("wc <fichier>", "tm-err"); const f = await fileOf(a[0]); if (!f) return print(tr("Fichier introuvable :") + " " + a[0], "tm-err");
      print([f.content.split("\n").length, f.content.split(/\s+/).filter(Boolean).length, f.content.length].join("  ") + "  " + f.path);
    },
    async grep(a) {
      if (!need()) return; if (!a[0]) return print("grep <texte>", "tm-err"); const q = a[0].toLowerCase(); let n = 0;
      for (const f of await fileList()) {
        const full = await fileOf(f.path); if (!full) continue;
        full.content.split("\n").forEach((l, i) => { if (n < 100 && l.toLowerCase().includes(q)) { n++; print(f.path + ":" + (i + 1) + ": " + l.trim().slice(0, 160)); } });
      }
      print(n ? n + " " + tr("résultat(s)") + (n >= 100 ? " (" + tr("limité à 100") + ")" : "") : tr("Aucun résultat."));
    },
    async versions(a) {
      if (!need()) return; if (!a[0]) return print("versions <fichier>", "tm-err"); const f = await fileOf(a[0]); if (!f) return print(tr("Fichier introuvable :") + " " + a[0], "tm-err");
      const { data, error } = await db.from("project_versions").select("version, created_at").eq("file_id", f.id).order("version", { ascending: false }).limit(50);
      if (error) return print(tr("Historique réservé au propriétaire du projet."), "tm-err");
      (data || []).forEach(v => print("v" + String(v.version).padEnd(5) + new Date(v.created_at).toLocaleString(document.documentElement.lang)));
    },
    async stats() {
      if (!need()) return; const f = await fileList(); const { data } = await db.from("project_versions").select("version").eq("project_id", project.id).limit(1000);
      print(tr("Fichiers") + " : " + f.length); print(tr("Versions enregistrées") + " : " + (data ? data.length : 0)); print(tr("Statut") + " : " + project.status);
    },
    whoami() { print(tr("Compte") + " " + me.slice(0, 8) + "…"); },
    date() { print(new Date().toLocaleString(document.documentElement.lang)); },
    history() { history.forEach((h, i) => print(String(i + 1).padStart(3) + "  " + h)); },
    clear() { out.innerHTML = ""; }
  };

  async function run(line) {
    const trimmed = line.trim(); if (!trimmed) return;
    print(promptEl.textContent + " " + trimmed, "tm-cmd"); history.push(trimmed); hpos = history.length;
    const [name, ...args] = split(trimmed);
    const fn = Object.prototype.hasOwnProperty.call(CMD, name) ? CMD[name] : null;
    if (!fn) return print(tr("Commande inconnue :") + " " + name + ". " + tr("Tapez help."), "tm-err");
    try { await fn(args); } catch (_) { print(tr("Erreur de lecture. Réessayez."), "tm-err"); }
  }
  $("tm-form").addEventListener("submit", async e => { e.preventDefault(); const v = input.value; input.value = ""; await run(v); });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowUp") { e.preventDefault(); if (hpos > 0) { hpos--; input.value = history[hpos]; } }
    else if (e.key === "ArrowDown") { e.preventDefault(); if (hpos < history.length - 1) { hpos++; input.value = history[hpos]; } else { hpos = history.length; input.value = ""; } }
  });
  out.addEventListener("click", () => input.focus());
  setPrompt(); print(tr("Terminal de projet ALDETIC. Tapez help pour la liste des commandes.")); input.focus();
});
