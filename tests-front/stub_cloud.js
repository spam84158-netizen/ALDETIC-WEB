(function(){
  const now=()=>new Date().toISOString(); let seq=0;
  const db={ projects:[{id:'p1',name:'Mon site',slug:'mon-site',status:'active',owner_id:'u1',updated_at:now()},{id:'p2',name:'Archivé',slug:'arch',status:'archived',owner_id:'u1',updated_at:now()}],
    deployments:[{id:'d1',project_id:'p1',status:'ready',url:'https://ald-mon-site-aaaa.pages.dev',error:null,files_count:3,created_at:new Date(Date.now()-86400000).toISOString()},{id:'d2',project_id:'p1',status:'failed',url:null,error:'index_html_required',files_count:1,created_at:new Date(Date.now()-172800000).toISOString()},{id:'d3',project_id:'p1',status:'ready',url:'javascript:alert(1)',error:null,files_count:1,created_at:new Date(Date.now()-259200000).toISOString()}],
    deployment_logs:[{deployment_id:'d1',level:'info',message:'Vérification : 3 fichier(s) valides.',at:now(),id:1},{deployment_id:'d1',level:'error',message:'<img src=x onerror=window.__xss=1>',at:now(),id:2}],
    project_env_keys:[{project_id:'p1',key:'API_KEY',updated_at:now()}], project_domains:[{project_id:'p1',domain:'www.monsite.ci',status:'pending',created_at:now()}] };
  window.__db=db; window.__calls=[];
  const chain=(t)=>{const st={f:[]};const o={select(){return o},eq(c,v){st.f.push([c,v]);return o},order(){return o},limit(){return o},then(res){res({data:db[t].filter(r=>st.f.every(f=>r[f[0]]===f[1])),error:null})}};return o;};
  const fail=(c)=>({data:null,error:{context:{json:async()=>({error:c})}}});
  const act=(b)=>{ window.__calls.push(b);
    if(window.__fail&&b.action==='deploy') return fail(window.__fail);
    if(b.action==='deploy'){ db.deployments.unshift({id:'d'+(++seq+10),project_id:b.project_id,status:'ready',url:'https://ald-mon-site-new.pages.dev',error:null,files_count:3,created_at:now()}); return {data:{ok:true,url:'https://ald-mon-site-new.pages.dev'},error:null}; }
    if(b.action==='env_set'){ if(!/^[A-Z][A-Z0-9_]{1,63}$/.test(b.key)) return fail('invalid_key'); db.project_env_keys.push({project_id:b.project_id,key:b.key,updated_at:now()}); return {data:{ok:true},error:null}; }
    if(b.action==='env_delete'){ db.project_env_keys=db.project_env_keys.filter(k=>k.key!==b.key); return {data:{ok:true},error:null}; }
    if(b.action==='domain_add'){ if(!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(b.domain)) return fail('invalid_domain'); db.project_domains.push({project_id:b.project_id,domain:b.domain,status:'pending',created_at:now()}); return {data:{ok:true,cname:'ald-mon-site-aaaa.pages.dev'},error:null}; }
    if(b.action==='rollback'){ return {data:{ok:true},error:null}; }
    return fail('unknown_action'); };
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:window.__ANON?null:{user:{id:'u1'}}}})},
    from:t=>t==='profiles'?{select:()=>({eq:()=>({single:async()=>({data:{phone_verified:true}}),maybeSingle:async()=>({data:{phone_verified:true}})})})}:chain(t),
    functions:{invoke:async(n,{body})=>act(body)}})};
  const oa=window.alert; 
})();
