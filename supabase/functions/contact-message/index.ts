import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const out=(status:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return out(405,{ok:false,error:"Méthode non autorisée."});
 try{
  const body=await req.json(), name=String(body.name||"").trim().slice(0,80), email=String(body.email||"").trim().toLowerCase().slice(0,120), message=String(body.message||"").trim().slice(0,2000);
  if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||message.length<10) return out(400,{ok:false,error:"Nom, e-mail ou message invalide."});
  const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key) return out(503,{ok:false,error:"Configuration serveur incomplète."});
  const db=createClient(url,key,{auth:{persistSession:false}});
  const {data:row,error}=await db.from("contact_messages").insert({name,email,message}).select("id").single();
  if(error){console.error("Contact save error",error.message);return out(500,{ok:false,error:"Enregistrement du message impossible. Vérifiez la migration SQL."});}
  await db.from("audit_logs").insert({action:"contact.message.received",target_type:"contact_message",target_id:row.id,details:{sender_email:email}});
  const resend=Deno.env.get("RESEND_API_KEY"), to=Deno.env.get("NOTIFY_EMAIL"), from=Deno.env.get("FROM_EMAIL");
  if(!resend||!to||!from) return out(200,{ok:true,saved:true,notified:false,message:"Message enregistré, notification e-mail non configurée."});
  const mail=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${resend}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],reply_to:email,subject:`Message du site Aldetic — ${name}`,text:`Nom : ${name}\nE-mail : ${email}\n\n${message}`})});
  if(!mail.ok){console.error("Contact Resend error",mail.status,(await mail.text()).slice(0,300));return out(200,{ok:true,saved:true,notified:false,message:"Message enregistré, mais la notification e-mail a échoué."});}
  return out(200,{ok:true,saved:true,notified:true});
 }catch(e){console.error("contact-message",e);return out(500,{ok:false,error:"Erreur interne lors de l'envoi."});}
});
