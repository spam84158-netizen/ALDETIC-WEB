/* Vérification de démonstration sécurisée côté serveur. Le code 000000 est un code de test, pas un SMS réel. */
document.addEventListener("aldetic:ready", async () => {
 const db=window.aldeticDb,country=document.getElementById("country"),phone=document.getElementById("phone"),stepPhone=document.getElementById("step-phone"),stepCode=document.getElementById("step-code"),wait=document.getElementById("wait"),sent=document.getElementById("sent"),cerr=document.getElementById("cerr");
 let userId=null,autoTimer=null;
 window.ALDETIC_COUNTRIES.forEach((c,i)=>country.add(new Option(`${c.name} (+${c.dial})`,i)));
 country.value=Math.max(0,window.ALDETIC_COUNTRIES.findIndex(c=>c.dial==="225"));
 if(!db){location.replace("connexion.html");return;}
 const {data:{session},error:sessionError}=await db.auth.getSession();
 if(sessionError||!session){location.replace("connexion.html");return;} userId=session.user.id;
 const {data:profile}=await db.from("profiles").select("phone,phone_verified").eq("id",userId).maybeSingle();
 if(profile?.phone_verified){location.replace("tableau-de-bord.html");return;}
 if(profile?.phone){phone.value=profile.phone.replace(/^\+\d+/,"");}
 stepPhone.addEventListener("submit",async e=>{
  e.preventDefault();const c=window.ALDETIC_COUNTRIES[Number(country.value)],err=document.getElementById("perr");let digits=phone.value.replace(/\D/g,"");if(c?.dial!=="225")digits=digits.replace(/^0/,"");
  if(!c||!/^\d+$/.test(digits)||digits.length<c.min||digits.length>c.max){err.textContent=`Numéro invalide pour ${c?.name||"ce pays"}.`;return;}
  const picked=`+${c.dial}${digits}`;err.textContent="";const button=stepPhone.querySelector("button");button.disabled=true;
  try{const {error}=await db.from("profiles").update({phone:picked}).eq("id",userId);if(error)throw error;
   stepPhone.hidden=true;stepCode.hidden=false;sent.textContent="Mode démonstration Aldetic : le code de test 000000 sera rempli automatiquement après 5 secondes. Aucun SMS réel ne sera envoyé.";wait.hidden=false;wait.textContent="Préparation du code de démonstration…";
   const code=document.getElementById("code");code.value="";
   autoTimer=setTimeout(()=>{code.value="000000";wait.hidden=true;cerr.textContent="Code de démonstration rempli. Validation automatique…";stepCode.requestSubmit();},5000);
  }catch(error){err.textContent="Enregistrement impossible : "+(error.message||"erreur serveur");button.disabled=false;}
 });
 stepCode.addEventListener("submit",async e=>{
  e.preventDefault();if(autoTimer)clearTimeout(autoTimer);const code=document.getElementById("code").value.trim();if(code!=="000000"){cerr.textContent="Code incorrect. Le code de démonstration est 000000.";return;}
  const button=stepCode.querySelector("button");button.disabled=true;cerr.textContent="Validation du numéro…";
  try{const {data,error}=await db.functions.invoke("verify-demo-phone",{body:{code}});if(error||!data?.ok)throw new Error(data?.error||error?.message||"Validation refusée.");cerr.textContent="Numéro validé en mode démonstration. Redirection…";location.replace("tableau-de-bord.html");}
  catch(error){cerr.textContent="Validation impossible : "+(error.message||"erreur serveur")+". Vérifiez que la fonction verify-demo-phone est déployée et que DEMO_PHONE_VERIFICATION=true.";button.disabled=false;}
 });
});
