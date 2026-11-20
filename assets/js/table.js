/* Petit tableau compact : tri, recherche, pagination, cartes sur mobile.
   alTable(conteneur, { columns:[{key,label,render(row),sort,align,mono}], rows, pageSize, search:[clés], empty })
   render(row) doit renvoyer du HTML déjà échappé (utiliser esc()). */
(function () {
  const h = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  window.alTable = function (root, opt) {
    const cols = opt.columns, size = opt.pageSize || 10, searchKeys = opt.search || [];
    let rows = opt.rows || [], q = "", page = 0, sortKey = null, dir = 1;
    const T = window.tr || (x => x);
    root.classList.add("dt");
    root.innerHTML = (searchKeys.length ? `<div class="dt-bar"><input class="dt-search" type="search" placeholder="${h(T("Rechercher"))}" aria-label="${h(T("Rechercher"))}"></div>` : "") +
      `<div class="dt-wrap"><table><thead><tr>${cols.map((c, i) => `<th data-i="${i}" ${c.sort ? `data-sort="1" aria-sort="none"` : ""} class="${c.align === "right" ? "dt-r" : ""}">${h(T(c.label))}</th>`).join("")}</tr></thead><tbody></tbody></table></div><div class="dt-foot"><span class="dt-count"></span><span><button type="button" class="btn small ghost dt-prev">${h(T("Précédent"))}</button> <button type="button" class="btn small ghost dt-next">${h(T("Suivant"))}</button></span></div>`;
    const body = root.querySelector("tbody"), count = root.querySelector(".dt-count"), prev = root.querySelector(".dt-prev"), next = root.querySelector(".dt-next");
    const view = () => {
      let r = rows;
      if (q) r = r.filter(x => searchKeys.some(k => String(x[k] == null ? "" : x[k]).toLowerCase().includes(q)));
      if (sortKey) r = r.slice().sort((a, b) => (a[sortKey] > b[sortKey] ? 1 : a[sortKey] < b[sortKey] ? -1 : 0) * dir);
      return r;
    };
    const draw = () => {
      const r = view(), pages = Math.max(1, Math.ceil(r.length / size));
      page = Math.min(page, pages - 1);
      const slice = r.slice(page * size, page * size + size);
      body.innerHTML = slice.length ? slice.map(row => `<tr>${cols.map(c => `<td data-label="${h(T(c.label))}" class="${c.align === "right" ? "dt-r" : ""}${c.mono ? " dt-mono" : ""}">${c.render ? c.render(row) : h(row[c.key])}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${cols.length}" class="dt-empty">${h(opt.empty || T("Aucune donnée."))}</td></tr>`;
      count.textContent = r.length ? `${page * size + 1}–${page * size + slice.length} / ${r.length}` : "0";
      prev.hidden = page === 0; next.hidden = page >= pages - 1;
    };
    root.querySelectorAll("th[data-sort]").forEach(th => th.addEventListener("click", () => {
      const k = cols[+th.dataset.i].key; dir = sortKey === k ? -dir : 1; sortKey = k;
      root.querySelectorAll("th[data-sort]").forEach(x => x.setAttribute("aria-sort", "none"));
      th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending"); page = 0; draw();
    }));
    const s = root.querySelector(".dt-search"); if (s) s.addEventListener("input", () => { q = s.value.trim().toLowerCase(); page = 0; draw(); });
    prev.addEventListener("click", () => { page--; draw(); }); next.addEventListener("click", () => { page++; draw(); });
    draw();
    return { setRows(n) { rows = n || []; draw(); } };
  };
})();
