import sys
from playwright.sync_api import sync_playwright
STUB = r"""
(function(){
  const settings=[{key:'withdraw_fee',value:{percent:2,min:100}},{key:'deposit_min',value:500},{key:'withdraw_min',value:1000}];
  const entries=[{id:1,kind:'deposit',available_delta:10000,reserved_delta:0,created_at:new Date().toISOString()},{id:2,kind:'withdrawal_reserve',available_delta:-6000,reserved_delta:6000,created_at:new Date(Date.now()-1000).toISOString()}];
  const deps=[{id:'d1',internal_ref:'DEP-AAAA',method:'wave',amount_minor:10000,status:'confirmed',created_at:new Date().toISOString()},{id:'d2',internal_ref:'DEP-BBBB',method:'orange_money',amount_minor:2000,status:'pending',created_at:new Date().toISOString()}];
  const wds=[{id:'w1',method:'wave',amount_minor:6000,fee_minor:120,status:'requested',created_at:new Date().toISOString()}];
  window.__calls=[];
  const chain=(data)=>{const o={select(){return o},eq(){return o},order(){return o},limit(){return o},maybeSingle:async()=>({data:data[0]||null}),single:async()=>({data:data[0]||null}),then(res){res({data,error:null})}};return o;};
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}})},
    from:t=>t==='wallet_balances'?chain([{available:4000,reserved:6000,currency:'XOF'}]):t==='wallet_entries'?chain(entries):t==='deposits'?chain(deps):t==='withdrawals'?chain(wds):t==='platform_settings'?chain(settings):t==='profiles'?chain([{phone_verified:true}]):chain([]),
    functions:{invoke:async(n,{body})=>{window.__calls.push(body);const fail=(c)=>({data:null,error:{context:{json:async()=>({error:c})}}});
      if(body.action==='deposit'){ if(body.method==='bank_transfer') return {data:{ok:true,internal_ref:'DEP-ZZZZ',instructions:{Banque:'<img src=x onerror=window.__xss=1>',IBAN:'FR76 0000'}},error:null}; return fail('provider_not_configured'); }
      if(body.action==='withdraw'){ if(body.method==='bank_transfer'&&!/^[A-Z]{2}\d{2}/i.test(body.destination.iban)) return fail('invalid_iban'); if(body.amount>4000) return fail('insufficient_funds'); return {data:{ok:true,id:'w2',fee:Math.max(Math.ceil(body.amount*0.02),100),net:body.amount-Math.max(Math.ceil(body.amount*0.02),100)},error:null}; } }}})};
})();
"""
res=[]
def check(n,c): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n)
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    pg=b.new_page(viewport={'width':1100,'height':900},locale='fr-FR'); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/cdn.jsdelivr.net/**", lambda r: r.abort()); pg.add_init_script(STUB)
    pg.goto("http://localhost:8765/portefeuille.html"); pg.wait_for_timeout(1000)
    digits=lambda s: ''.join(ch for ch in s if ch.isdigit())
    check("solde disponible 4 000 / réservé 6 000", digits(pg.inner_text("#b-av"))=="4000" and digits(pg.inner_text("#b-rs"))=="6000")
    check("1 dépôt en attente compté", pg.inner_text("#b-pd").strip()=="1")
    check("historique : 2 lignes avec libellés", pg.locator("#t-entries tbody tr").count()==2 and "Dépôt" in pg.inner_text("#t-entries"))
    check("dépôts : référence et statut", "DEP-AAAA" in pg.inner_text("#t-deps") and "Confirmé" in pg.inner_text("#t-deps") and "En attente" in pg.inner_text("#t-deps"))
    check("retraits : frais et net affichés", digits(pg.inner_text("#t-wds"))!="" and "Net" in pg.inner_text("#t-wds"))
    check("6 moyens de dépôt, 5 de retrait (pas de carte)", pg.locator("#dep-method option").count()==6 and pg.locator("#wd-method option").count()==5)
    pg.fill("#wd-amount","3000"); pg.wait_for_timeout(100)
    check("aperçu : frais 100 (minimum) et net 2 900", digits(pg.inner_text("#wd-fee"))=="100" and digits(pg.inner_text("#wd-net"))=="2900")
    pg.fill("#wd-amount","10000"); pg.wait_for_timeout(100)
    check("aperçu : 2 % = 200, net 9 800", digits(pg.inner_text("#wd-fee"))=="200" and digits(pg.inner_text("#wd-net"))=="9800")
    # dépôt mobile : prestataire absent
    pg.select_option("#dep-method","wave"); pg.fill("#dep-amount","5000"); pg.click("#dep-go"); pg.wait_for_timeout(400)
    check("dépôt mobile : message prestataire non connecté, pas de référence", "prestataire" in pg.inner_text("#dep-err") and pg.is_hidden("#dep-out"))
    # dépôt virement : consignes échappées
    pg.select_option("#dep-method","bank_transfer"); pg.click("#dep-go"); pg.wait_for_timeout(400)
    check("virement : référence + consignes + avertissement de crédit après confirmation", "DEP-ZZZZ" in pg.inner_text("#dep-out") and "uniquement après confirmation" in pg.inner_text("#dep-out"))
    check("consignes : HTML non interprété (XSS)", pg.evaluate("window.__xss")==None and pg.locator("#dep-out img").count()==0)
    # montant invalide
    pg.fill("#dep-amount","12.5"); pg.click("#dep-go"); pg.wait_for_timeout(200)
    check("montant décimal refusé côté écran sans appel serveur", pg.evaluate("window.__calls.filter(c=>c.action==='deposit').length")==2 and "invalide" in pg.inner_text("#dep-err").lower())
    # retrait trop grand
    pg.select_option("#wd-method","wave"); pg.fill("#d-phone","+2250700000001"); pg.fill("#wd-amount","9000"); pg.click("#wd-go"); pg.wait_for_timeout(400)
    check("retrait au-dessus du solde : refus affiché", "insuffisant" in pg.inner_text("#wd-err"))
    pg.fill("#wd-amount","3000"); pg.click("#wd-go"); pg.wait_for_timeout(500)
    print("WD-OK:", repr(pg.inner_text("#wd-ok")), "| WD-ERR:", repr(pg.inner_text("#wd-err")))
    check("retrait accepté : frais/net confirmés par le serveur", "Demande envoyée" in pg.inner_text("#wd-ok") and digits(pg.inner_text("#wd-ok"))=="1002900")
    # virement retrait : IBAN invalide
    pg.select_option("#wd-method","bank_transfer"); pg.wait_for_timeout(100)
    check("virement : champs IBAN/titulaire affichés", pg.locator("#d-iban").count()==1 and pg.locator("#d-holder").count()==1)
    pg.fill("#d-iban","123"); pg.fill("#d-holder","Awa Koné"); pg.fill("#wd-amount","2000"); pg.click("#wd-go"); pg.wait_for_timeout(400)
    check("IBAN invalide refusé", "IBAN" in pg.inner_text("#wd-err"))
    print("ERREURS:", sorted(set(errs)))
    check("aucune erreur JS (hors CDN bloqué)", not [e for e in errs if 'gsap' not in e.lower() and 'ScrollTrigger' not in e])
    m=b.new_page(viewport={'width':390,'height':800},locale='fr-FR'); m.route("**/cdn.jsdelivr.net/**", lambda r: r.abort()); m.add_init_script(STUB); m.goto("http://localhost:8765/portefeuille.html"); m.wait_for_timeout(900)
    check("mobile : pas de défilement horizontal", m.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
    b.close()
print(f"{sum(res)}/{len(res)} OK"); sys.exit(0 if all(res) else 1)
