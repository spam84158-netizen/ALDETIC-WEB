import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const out=(status:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{status,headers:cors});
Deno.serve(async req=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return out(405,{error:"Méthode non autorisée."});
 try{
  const url=Deno.env.get("SUPABASE_URL"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!url||!service||!token) return out(401,{error:"Connectez-vous pour utiliser l'assistant."});
  const db=createClient(url,service,{auth:{persistSession:false}});
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user) return out(401,{error:"Session invalide. Reconnectez-vous."});
  const {data:profile,error:profileError}=await db.from("profiles").select("phone_verified").eq("id",user.id).maybeSingle();
  if(profileError) return out(500,{error:"Impossible de vérifier les autorisations du compte."});
  if(!profile?.phone_verified) return out(403,{error:"Vérifiez votre numéro avant d'utiliser l'assistant."});
  let body:any; try{body=await req.json();}catch{return out(400,{error:"Requête JSON invalide."});}
  const question=typeof body?.question==="string"?body.question.trim():"";
  if(question.length<3||question.length>1000) return out(400,{error:"La question doit contenir entre 3 et 1000 caractères."});
  const limit=Number(Deno.env.get("AI_DAILY_LIMIT")||"0");
  if(Number.isFinite(limit)&&limit>0){
   const since=new Date(new Date().setUTCHours(0,0,0,0)).toISOString();
   const {count,error}=await db.from("ai_usage").select("id",{count:"exact",head:true}).eq("user_id",user.id).gte("created_at",since);
   if(error) return out(500,{error:"Impossible de vérifier le quota IA."});
   if((count||0)>=limit) return out(429,{error:"Limite quotidienne atteinte. Réessayez demain."});
  }
  const apiKey=Deno.env.get("GROQ_API_KEY"),model=Deno.env.get("GROQ_MODEL")||"openai/gpt-oss-120b";
  if(!apiKey) return out(503,{error:"Clé GROQ_API_KEY absente dans les secrets Supabase."});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000);
  let response:Response;
  try{response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({model,messages:[{role:"system",content:"Tu es l'assistant d'Aldetic Frontiers. Réponds dans la langue de l'utilisateur, de façon claire, utile et prudente."},{role:"user",content:question}],temperature:0.6,max_tokens:1200})});}
  catch(e){clearTimeout(timer);console.error("Groq network/timeout",e);return out(504,{error:e?.name==="AbortError"?"Le fournisseur IA n'a pas répondu à temps. Réessayez.":"Connexion au fournisseur IA impossible."});}
  clearTimeout(timer);
  if(!response.ok){const detail=(await response.text()).slice(0,400);console.error("Groq API",response.status,detail);return out(response.status===429?429:502,{error:response.status===429?"Quota Groq temporairement atteint.":`Erreur du fournisseur IA (${response.status}). Vérifiez GROQ_MODEL et GROQ_API_KEY dans Supabase.`});}
  const json=await response.json(),answer=json?.choices?.[0]?.message?.content;
  if(typeof answer!=="string"||!answer.trim()) return out(502,{error:"Le fournisseur IA a renvoyé une réponse vide."});
  const {error:usageError}=await db.from("ai_usage").insert({user_id:user.id});
  if(usageError) console.error("ai_usage insert failed",usageError.message);
  await db.from("audit_logs").insert({actor_id:user.id,action:"ai.request.completed",target_type:"ai",details:{model}});
  return out(200,{answer:answer.trim()});
 }catch(e){console.error("ask-ai fatal",e);return out(500,{error:"Erreur interne de l'assistant IA. Consultez les journaux Edge Function."});}
});
