import {createClient} from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const out=(status:number,data:Record<string,unknown>)=>new Response(JSON.stringify(data),{status,headers:cors});
Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return out(405,{ok:false,error:"Méthode non autorisée."});
 try{if(Deno.env.get("DEMO_PHONE_VERIFICATION")!=="true")return out(403,{ok:false,error:"La validation de démonstration est désactivée côté serveur."});
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");if(!url||!key||!token)return out(401,{ok:false,error:"Connexion requise."});
 const db=createClient(url,key,{auth:{persistSession:false}}),{data:{user},error}=await db.auth.getUser(token);if(error||!user)return out(401,{ok:false,error:"Session invalide."});
 const body=await req.json().catch(()=>({}));if(body.code!=="000000")return out(400,{ok:false,error:"Code de démonstration incorrect."});
 const {data:profile,error:read}=await db.from("profiles").select("phone").eq("id",user.id).maybeSingle();if(read||!profile?.phone)return out(400,{ok:false,error:"Enregistrez d'abord un numéro de téléphone."});
 const {error:update}=await db.from("profiles").update({phone_verified:true}).eq("id",user.id);if(update){console.error(update);return out(500,{ok:false,error:"Impossible de valider le compte."});}
 await db.from("audit_logs").insert({actor_id:user.id,action:"phone.demo_verified",target_type:"profile",target_id:user.id,details:{method:"demo_code"}});
 return out(200,{ok:true,verified:true,mode:"demo"});
 }catch(e){console.error("verify-demo-phone",e);return out(500,{ok:false,error:"Erreur serveur pendant la validation."});}});
