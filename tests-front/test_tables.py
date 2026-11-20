import sys
from playwright.sync_api import sync_playwright
STUB = r"""
(function(){
  const svc = []; const names = ['API','Auth','Base de données','Stockage','Lia','Déploiements','Git','Cloud','Paiements','Notifications','Éditeur','Support'];
  names.forEach((n,i)=>svc.push({service_key:'k'+i,label:n,status:i===3?'degraded':'operational',message:i===3?'Latence élevée <b>x</b>':null,updated_at:new Date(Date.now()-i*3600000).toISOString()}));
  const refs = []; ['pending','qualified','rewarded','rejected','qualified','pending'].forEach((s,i)=>refs.push({status:s,created_at:new Date(Date.now()-i*86400000).toISOString(),qualified_at:s==='qualified'?new Date().toISOString():null}));
  const chain = (data) => { const o = { select(){return o}, order(){return o}, limit(){return o}, eq(){return o}, maybeSingle: async()=>({data:data[0]||null}), then(res){res({data,error:null})} }; return o; };
  window.supabase = { createClient: () => ({ auth:{ getSession: async()=>({data:{session:{user:{id:'u1'}}}}) },
    rpc: async()=>({data:'ABCD1234',error:null}),
    from: t => t==='service_status'?chain(svc): t==='referral_progress'?chain([{available:3,pending:2,consumed:8,required:8}]): t==='referrals'?chain(refs): t==='profiles'?chain([{phone_verified:true}]):chain([]) }) };
})();
"""
res=[]
def check(n,c): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n)
with sync_playwright() as p:
    b=p.chromium.launch()
    def page(url, vp=None):
        pg=b.new_page(viewport=vp or {'width':1100,'height':800}); pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.route("**/cdn.jsdelivr.net/**", lambda r: r.abort()); pg.add_init_script(STUB); pg.goto("http://localhost:8765/"+url); pg.wait_for_timeout(900); return pg
    errs=[]
    pg=page("statut.html")
    check("statut : tableau avec 10 lignes sur 12", pg.locator("#services tbody tr").count()==10)
    check("statut : compteur 1–10 / 12", "1–10 / 12" in pg.inner_text("#services .dt-count"))
    pg.click("#services .dt-next"); pg.wait_for_timeout(200)
    check("statut : page 2 = 2 lignes", pg.locator("#services tbody tr").count()==2)
    pg.fill("#services .dt-search","lia"); pg.wait_for_timeout(200)
    check("statut : recherche 'lia' = 1 ligne", pg.locator("#services tbody tr").count()==1 and "Lia" in pg.inner_text("#services tbody"))
    pg.fill("#services .dt-search",""); pg.click('#services th[data-i="0"]'); pg.wait_for_timeout(200)
    first=pg.locator("#services tbody tr td").first.inner_text()
    check("statut : tri croissant par service (API en premier)", first.strip().startswith("API"))
    pg.click('#services th[data-i="0"]'); pg.wait_for_timeout(200)
    check("statut : tri décroissant", pg.get_attribute('#services th[data-i="0"]',"aria-sort")=="descending")
    check("statut : message échappé (pas de HTML injecté)", pg.locator("#services b", has_text="x").count()==0)
    check("statut : bandeau global signale le service dégradé", "dégradés" in pg.inner_text("#overall"))
    m=page("statut.html",{'width':390,'height':800})
    check("mobile : en-têtes masqués hors écran, lignes en cartes", m.evaluate("getComputedStyle(document.querySelector('#services thead')).position")=="absolute" and m.evaluate("getComputedStyle(document.querySelector('#services tbody tr')).display")=="block")
    check("mobile : pas de défilement horizontal de la page", m.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
    check("mobile : libellés de colonnes affichés dans les cartes", m.evaluate("getComputedStyle(document.querySelector('#services td'),'::before').content")!="none")
    pr=page("parrainage.html")
    check("parrainage : historique en tableau (6 lignes)", pr.locator("#ref-hist tbody tr").count()==6)
    check("parrainage : statuts affichés", "Utilisé" in pr.inner_text("#ref-hist") and "Rejeté" in pr.inner_text("#ref-hist"))
    check("parrainage : progression 3 / 8", "3 / 8" in pr.inner_text("#st-progress"))
    print("ERREURS:", sorted(set(errs)))
    check("aucune erreur JS propre à nos pages (hors CDN bloqué en test)", not [e for e in errs if "gsap" not in e.lower() and "ScrollTrigger" not in e])
    b.close()
print(f"{sum(res)}/{len(res)} OK"); sys.exit(0 if all(res) else 1)
