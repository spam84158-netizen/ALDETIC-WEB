import sys
from playwright.sync_api import sync_playwright
res=[]
def check(n,c): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n)
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    m=b.new_page(viewport={'width':390,'height':800}); m.on("pageerror", lambda e: errs.append(str(e)))
    m.route("**/cdn.jsdelivr.net/**", lambda r: r.abort()); m.goto("http://localhost:8765/communaute.html"); m.wait_for_timeout(700)
    check("mobile : barre flottante visible avec 5 éléments", m.locator(".bnav").is_visible() and m.locator(".bnav > *").count()==5)
    check("mobile : page courante marquée (Communauté)", m.locator('.bnav a[aria-current="page"]').count()==1)
    check("mobile : bouton central surélevé", m.evaluate("document.querySelector('.bn-main').getBoundingClientRect().top < document.querySelector('.bnav').getBoundingClientRect().top + 10"))
    check("mobile : le contenu n'est pas masqué (marge basse)", m.evaluate("parseInt(getComputedStyle(document.body).paddingBottom)>=100"))
    m.click(".bn-menu"); m.wait_for_timeout(300)
    check("mobile : bouton Menu ouvre la navigation", m.evaluate("document.getElementById('nav').classList.contains('open')"))
    check("mobile : pas de défilement horizontal", m.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
    d=b.new_page(viewport={'width':1200,'height':800}); d.route("**/cdn.jsdelivr.net/**", lambda r: r.abort()); d.goto("http://localhost:8765/communaute.html"); d.wait_for_timeout(600)
    check("ordinateur : barre flottante masquée", not d.locator(".bnav").is_visible())
    check("aucune erreur JS (hors CDN bloqué)", not [e for e in errs if 'gsap' not in e.lower() and 'ScrollTrigger' not in e])
    b.close()
print(f"{sum(res)}/{len(res)} OK"); sys.exit(0 if all(res) else 1)
