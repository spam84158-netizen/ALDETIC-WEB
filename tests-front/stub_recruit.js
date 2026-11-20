(function(){
  const now=()=>new Date().toISOString(); let seq=0; const ME=window.__ME||'u1'; const ADMIN=!!window.__ADMIN;
  const db={
    job_offers:[{id:'o1',slug:'dev-backend',title:'Développeur backend',summary:'API <i>Node</i>',responsibilities:['Concevoir des API','Écrire des tests'],requirements:['Postgres','Node'],conditions:'Télétravail',benefits:'Matériel fourni',status:'open',created_at:now()},
                {id:'o2',slug:'ferme',title:'Poste fermé',status:'closed',created_at:now()}],
    recruitment_applications:[{id:'a1',public_ref:'APP-AAAA111111',user_id:'u1',offer_id:'o1',full_name:'Awa Koné',email:'awa@test.io',role_title:'Développeur',message:'Message <b>gras</b> de la candidate',cv_path:'u1/cv.pdf',status:'info_requested',created_at:now(),links:[]},
                              {id:'a2',public_ref:'APP-BBBB222222',user_id:'u9',offer_id:null,full_name:'Autre Personne',email:'autre@test.io',role_title:'Designer UI/UX',message:'Je suis designer depuis 5 ans.',cv_path:null,status:'received',created_at:now(),links:[]}],
    recruitment_events:[{application_id:'a1',kind:'status',status_to:'received',body:'Candidature reçue',visible_to_candidate:true,created_at:now()},{application_id:'a1',kind:'message_to_candidate',status_to:'info_requested',body:'Pouvez-vous joindre votre portfolio ?',visible_to_candidate:true,created_at:new Date(Date.now()+1000).toISOString()},{application_id:'a1',kind:'internal_comment',body:'Note secrète',visible_to_candidate:false,created_at:new Date(Date.now()+2000).toISOString()}]
  };
  window.__db=db; window.__rpc=[]; window.__uploads=[]; window.__emails=0;
  const visible=(t,r)=> ADMIN ? true : t==='recruitment_applications' ? r.user_id===ME : t==='recruitment_events' ? (r.visible_to_candidate && db.recruitment_applications.some(a=>a.id===r.application_id&&a.user_id===ME)) : t==='job_offers' ? r.status==='open' : true;
  const chain=(t)=>{const st={f:[],op:'select',ord:null,row:null,patch:null,single:false};
    const run=()=>{const rows=db[t];
      if(st.op==='insert'){ const r=Object.assign({id:'n'+(++seq),status:t==='recruitment_applications'?'received':undefined,created_at:now(),user_id:ME},st.row);
        if(t==='recruitment_applications'){ if(r.cv_path&&!r.cv_path.startsWith(ME+'/')) return {data:null,error:{message:'check constraint recruitment_cv_own_folder'}};
          if(window.__failInsert) return {data:null,error:{message:window.__failInsert}};
          if(r.offer_id&&!db.job_offers.some(o=>o.id===r.offer_id&&o.status==='open')) return {data:null,error:{message:'offer_closed'}};
          r.public_ref='APP-NEW'+(++seq).toString().padStart(7,'0'); db.recruitment_events.push({application_id:r.id,kind:'status',status_to:'received',body:'Candidature reçue',visible_to_candidate:true,created_at:now()}); }
        rows.push(r); return {data:st.single?r:[r],error:null}; }
      let m=rows.filter(r=>visible(t,r)&&st.f.every(f=>r[f[0]]===f[1]));
      if(st.op==='update'){ m.forEach(r=>Object.assign(r,st.patch)); return {data:null,error:null}; }
      if(st.ord) m=m.slice().sort((a,b)=>(a[st.ord[0]]>b[st.ord[0]]?1:-1)*(st.ord[1]?1:-1));
      return {data:m,error:null}; };
    const o={select(){return o},eq(c,v){st.f.push([c,v]);return o},order(c,opt){st.ord=[c,!(opt&&opt.ascending===false)];return o},limit(){return o},insert(r){st.op='insert';st.row=r;return o},update(p){st.op='update';st.patch=p;return o},
      single:async()=>{st.single=true;const r=run();return r.error?r:{data:r.data,error:null}},then(res){res(run())}}; return o;};
  const NEXT={received:['in_review','rejected'],in_review:['info_requested','interview','accepted','rejected'],info_requested:['in_review','rejected'],interview:['accepted','rejected']};
  const rpc={
    aldetic_is_admin:()=>ADMIN,
    application_transition:(a)=>{ if(!ADMIN) return {ok:false,reason:'forbidden'}; const x=db.recruitment_applications.find(r=>r.id===a.p_id); if(!(NEXT[x.status]||[]).includes(a.p_to)) return {ok:false,reason:'invalid_transition'};
      if(a.p_to==='info_requested'&&!(a.p_note||'').trim()) return {ok:false,reason:'message_required'}; x.status=a.p_to; db.recruitment_events.push({application_id:x.id,kind:'status',status_to:a.p_to,body:a.p_note,visible_to_candidate:true,created_at:now()}); if(a.p_to==='accepted') window.__badge=x.user_id; return {ok:true}; },
    application_comment:(a)=>{ if(!ADMIN) throw new Error('forbidden'); db.recruitment_events.push({application_id:a.p_id,kind:'internal_comment',body:a.p_body,visible_to_candidate:false,created_at:now()}); return null; },
    application_reply:(a)=>{ const x=db.recruitment_applications.find(r=>r.id===a.p_id&&r.user_id===ME); if(!x||x.status!=='info_requested') return {ok:false,reason:'no_request_pending'}; db.recruitment_events.push({application_id:x.id,kind:'message_from_candidate',body:a.p_body,visible_to_candidate:true,created_at:now()}); x.status='in_review'; return {ok:true}; }
  };
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:window.__ANON?null:{user:{id:ME}}}})},
    from:t=>t==='profiles'?{select:()=>({eq:()=>({single:async()=>({data:{phone_verified:true}}),maybeSingle:async()=>({data:{phone_verified:true}})})})}:chain(t),
    rpc:async(n,a)=>{window.__rpc.push([n,a]);try{return {data:rpc[n](a),error:null}}catch(e){return {data:null,error:{message:String(e.message)}}}},
    storage:{from:()=>({upload:async(p,f)=>{window.__uploads.push(p);return window.__failUpload?{data:null,error:{message:'x'}}:{data:{path:p},error:null}},remove:async(p)=>{window.__removed=p;return {error:null}},createSignedUrl:async(p)=>({data:{signedUrl:'https://signed.example/'+p},error:null})})}})};
  const of=window.fetch; window.fetch=function(u,o){ if(String(u).includes('notify-application')){window.__emails++; return Promise.resolve(new Response('{}'));} return of.apply(this,arguments); };
})();
