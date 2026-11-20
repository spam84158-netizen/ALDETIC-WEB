import sys
from playwright.sync_api import sync_playwright

STUB = """
window.__calls = []; window.__verified = false;
window.supabase = { createClient: () => ({
  auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { phone_verified: !!window.__verified }, error: null }) }) }) }),
  functions: { invoke: async (name, { body }) => {
    window.__calls.push(body);
    const fail = (code, left) => ({ data: null, error: { context: { json: async () => ({ error: code, attempts_left: left }) } } });
    if (body.action === 'send') return { data: { ok: true, mode: 'simulation', demo_code: '483921' }, error: null };
    if (body.action === 'verify') {
      if (body.code === '483921') { window.__verified = true; return { data: { ok: true }, error: null }; }
      return fail('invalid_code', 3);
    }
  }
}) };
"""
results = []
def check(name, cond):
    results.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.abort())
    pg.add_init_script(STUB)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8765/verification-telephone.html"); pg.wait_for_timeout(700)
    pg.fill("#phone", "612345678"); pg.click("#step-phone button[type=submit]"); pg.wait_for_timeout(500)
    check("étape code affichée après demande", pg.is_visible("#step-code"))
    check("code simulé affiché", pg.inner_text("#demo-code") == "483921")
    check("code prérempli pour faciliter le test", pg.input_value("#code") == "483921")
    check("mode simulation explicitement signalé", "simulation" in pg.inner_text("#sent").lower())
    pg.fill("#code", "000000"); pg.click("#step-code button[type=submit]"); pg.wait_for_timeout(300)
    check("code incorrect refusé", "incorrect" in pg.inner_text("#cerr").lower())
    pg.fill("#code", "483921"); pg.click("#step-code button[type=submit]"); pg.wait_for_timeout(1200)
    check("code correct accepté et redirection", "tableau-de-bord" in pg.url)
    check("aucune erreur JavaScript", not errs)
    b.close()
bad = [n for n, ok in results if not ok]
print(f"\\n{len(results)-len(bad)}/{len(results)} OK")
sys.exit(1 if bad else 0)
