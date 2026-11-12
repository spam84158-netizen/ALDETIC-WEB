import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const out=(status:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return out(405,{ok:false,error:"Méthode non autorisée."});
 try{
  const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!url||!key||!token) return out(401,{ok:false,error:"Session administrateur requise."});
  const db=createClient(url,key,{auth:{persistSession:false}});
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user) return out(401,{ok:false,error:"Session invalide."});
  const {data:roles}=await db.from("user_roles").select("role").eq("user_id",user.id);
  if(!(roles||[]).some((r:any)=>["owner","admin"].includes(String(r.role).toLowerCase()))) return out(403,{ok:false,error:"Droits administrateur insuffisants."});
  const body=await req.json(), id=String(body.application_id||""), message=String(body.message||"").trim();
  if(!id||message.length<2||message.length>3000) return out(400,{ok:false,error:"Candidature ou réponse invalide."});
  const {data:app,error:readError}=await db.from("applications").select("id,email,name").eq("id",id).single();
  if(readError||!app) return out(404,{ok:false,error:"Candidature introuvable."});
  const resend=Deno.env.get("RESEND_API_KEY"), from=Deno.env.get("FROM_EMAIL");
  if(!resend||!from) return out(503,{ok:false,error:"Configuration e-mail Resend incomplète."});
  const mail=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${resend}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[app.email],subject:"Réponse à votre candidature — Aldetic Frontiers",text:`Bonjour ${app.name||""},\n\n${message}\n\nL'équipe Aldetic Frontiers`})});
  if(!mail.ok){console.error("Resend reply error",mail.status,(await mail.text()).slice(0,300));return out(502,{ok:false,error:"L'e-mail n'a pas pu être envoyé. Vérifiez le domaine expéditeur Resend."});}
  const {error:saveError}=await db.from("application_replies").insert({application_id:id,admin_id:user.id,message});
  if(saveError){console.error("Reply log error",saveError.message);return out(500,{ok:false,error:"E-mail envoyé mais archivage de la réponse impossible. Vérifiez la migration SQL."});}
  await db.from("applications").update({replied_at:new Date().toISOString()}).eq("id",id);
  await db.from("audit_logs").insert({actor_id:user.id,action:"application.reply.sent",target_type:"application",target_id:id,details:{recipient:app.email}});
  return out(200,{ok:true});
 }catch(e){console.error("reply-application",e);return out(500,{ok:false,error:"Erreur interne lors de l'envoi."});}
});
