import sys, json
from playwright.sync_api import sync_playwright
STUB = r"""
(function(){
  const store = { notifications: [], notification_preferences: [] };
  for (let i = 1; i <= 25; i++) store.notifications.push({ id: 'n'+i, type: i%2 ? 'community':'security', title: 'Notif '+i, body: i===1 ? '<img src=x onerror=window.__xss=1>' : null, action_url: i===2 ? 'javascript:alert(1)' : (i===3 ? 'communaute.html#post-1' : null), read_at: null, created_at: new Date(Date.now()-i*60000).toISOString() });
  window.__store = store;
  function qb(table){
    const st = { f: [], op: 'select', head: false, count: false, range: null, patch: null, rows: null, conflict: null };
    const run = () => {
      let rows = store[table];
      if (st.op === 'update') { rows.filter(r => st.f.every(f => f(r))).forEach(r => Object.assign(r, st.patch)); return { data: null, error: null }; }
      if (st.op === 'upsert') { st.rows.forEach(n => { const i = rows.findIndex(r => r.user_id === n.user_id && r.type === n.type); if (i >= 0) rows[i] = n; else rows.push(n); }); window.__upserts = (window.__upserts||0)+1; return { data: null, error: null }; }
      rows = rows.filter(r => st.f.every(f => f(r)));
      if (st.order) rows = rows.slice().sort((a,b)=> a[st.order] < b[st.order] ? 1 : -1);
      const total = rows.length; if (st.range) rows = rows.slice(st.range[0], st.range[1]+1);
      return { data: st.head ? null : rows, count: total, error: null };
    };
    const b = { select(c, o){ st.head = !!(o&&o.head); return b; }, order(c){ st.order = c; return b; }, range(a,z){ st.range=[a,z]; return b; },
      is(c,v){ st.f.push(r => r[c] === v); return b; }, eq(c,v){ st.f.push(r => r[c] === v); return b; },
      update(p){ st.op='update'; st.patch=p; return b; }, upsert(r,o){ st.op='upsert'; st.rows=r; return b; },
      then(res, rej){ try { res(run()); } catch(e){ rej && rej(e); } } };
    return b;
  }
  window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    from: (t) => t === 'profiles' ? { select: () => ({ eq: () => ({ single: async () => ({ data: { phone_verified: true } }), maybeSingle: async () => ({ data: { phone_verified: true } }) }) }) } : qb(t) }) };
})();
"""
res=[]
def check(n,c): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.abort()); pg.add_init_script(STUB)
    pg.goto("http://localhost:8765/notifications.html"); pg.wait_for_timeout(900)
    check("liste chargée (20 sur 25)", pg.locator("#list .event-row").count()==20)
    check("compteur non lues = 25", pg.inner_text("#unread").strip()=="25")
    check("pas de texte d'aperçu/exemple", "Exemple d'interface" not in pg.content() and "Mode aperçu" not in pg.content())
    check("XSS neutralisé (HTML échappé)", pg.evaluate("window.__xss")==None and pg.locator("#list img").count()==0)
    check("lien javascript: non rendu", 'javascript:' not in pg.inner_html("#list"))
    check("lien relatif rendu", pg.locator('#list a[href="communaute.html#post-1"]').count()==1)
    pg.click("#more"); pg.wait_for_timeout(300)
    check("voir plus : 25 lignes", pg.locator("#list .event-row").count()==25)
    pg.click('[data-read="n4"]'); pg.wait_for_timeout(400)
    check("marquer lu : compteur 24", pg.inner_text("#unread").strip()=="24")
    pg.click("#f-unread"); pg.wait_for_timeout(300)
    check("filtre non lues : n4 absente", pg.locator('#list [data-id="n4"]').count()==0 and pg.locator("#list .event-row").count()==20)
    pg.click("#read-all"); pg.wait_for_timeout(400)
    check("pastille Non lues active", pg.get_attribute("#f-unread","aria-pressed")=="true" and pg.get_attribute("#f-all","aria-pressed")=="false")
    check("tout lu : compteur 0 et liste vide affichée", pg.inner_text("#unread").strip()=="0" and pg.is_visible("#empty"))
    pg.uncheck('[data-pref="community"]'); pg.click("#save-prefs"); pg.wait_for_timeout(300)
    saved=pg.evaluate("window.__store.notification_preferences")
    check("préférences enregistrées (12 lignes, community=false)", len(saved)==12 and [r for r in saved if r['type']=='community'][0]['enabled']==False)
    check("message de confirmation", "enregistrées" in pg.inner_text("#prefs-msg"))
    check("aucune erreur JS", not errs)
    b.close()
print(f"{sum(res)}/{len(res)} OK"); sys.exit(0 if all(res) else 1)
