import sys
from playwright.sync_api import sync_playwright
STUB = r"""
window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) },
  from: (t) => ({ select: () => ({ order: async () => ({ data: window.__rows || [
    { service_key:'auth', label:'Authentification', status:'operational', message:null, updated_at:new Date().toISOString() },
    { service_key:'ai', label:'Lia AI', status:'degraded', message:'<b>Latence</b> élevée', updated_at:new Date().toISOString() } ], error: null }) }) }) }) };
"""
res=[]
def check(n,c): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(color_scheme='light'); pg=ctx.new_page(); errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.abort()); pg.add_init_script(STUB)
    pg.goto("http://localhost:8765/statut.html"); pg.wait_for_timeout(900)
    check("2 services affichés", pg.locator("#services .event-row").count()==2)
    check("bandeau global signale la dégradation", "dégradés" in pg.inner_text("#overall"))
    check("message HTML échappé", pg.locator("#services b", has_text="Latence").count()==0 and "<b>Latence</b>" in pg.inner_text("#services"))
    check("lien Statut dans le pied de page", pg.locator('footer a[href="statut.html"]').count()==1)
    check("thème initial clair (fond clair)", pg.evaluate("getComputedStyle(document.body).backgroundColor")=="rgb(242, 242, 247)")
    pg.click("#theme"); check("clic 1 → clair explicite", pg.evaluate("document.documentElement.dataset.theme")=="light")
    pg.click("#theme"); check("clic 2 → sombre", pg.evaluate("document.documentElement.dataset.theme")=="dark" and pg.evaluate("getComputedStyle(document.body).backgroundColor")=="rgb(7, 11, 24)")
    check("logo sombre affiché en thème sombre", pg.evaluate("getComputedStyle(document.querySelector('.site-header .logo-dark')).display")!="none" and pg.evaluate("getComputedStyle(document.querySelector('.site-header .logo-light')).display")=="none")
    pg.reload(); pg.wait_for_timeout(700)
    check("choix mémorisé après rechargement", pg.evaluate("document.documentElement.dataset.theme")=="dark")
    pg.click("#theme"); check("clic 3 → auto (suit le système)", pg.evaluate("document.documentElement.dataset.theme")==None)
    ctx.close()
    ctx=b.new_context(color_scheme='dark'); pg=ctx.new_page(); pg.route("**/cdn.jsdelivr.net/**", lambda r: r.abort()); pg.add_init_script(STUB)
    pg.goto("http://localhost:8765/statut.html"); pg.wait_for_timeout(700)
    check("système sombre → fond sombre sans choix", pg.evaluate("getComputedStyle(document.body).backgroundColor")=="rgb(7, 11, 24)")
    check("aucune erreur JS", not errs)
    b.close()
print(f"{sum(res)}/{len(res)} OK"); sys.exit(0 if all(res) else 1)
