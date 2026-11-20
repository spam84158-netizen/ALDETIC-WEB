(function(){
  const ME=window.__ME||'u1', STAFF=!!window.__STAFF, now=()=>new Date().toISOString(); let seq=0;
  const db={support_tickets:[
    {id:'t1',user_id:'u1',subject:'Dépôt non crédité',description:'Mon dépôt <b>Wave</b> de 5000 FCFA n\'apparaît pas.',category:'payment',status:'waiting_user',priority:'normal',assigned_to:null,created_at:now(),updated_at:now()},
    {id:'t2',user_id:'u9',subject:'Question sur l\'IA',description:'Comment fonctionne Lia exactement ?',category:'ai',status:'open',priority:'low',assigned_to:null,created_at:now(),updated_at:new Date(Date.now()-5000).toISOString()},
    {id:'t3',user_id:'u1',subject:'Ancien sujet',description:'Résolu depuis longtemps ce problème.',category:'general',status:'closed',priority:'normal',assigned_to:null,created_at:now(),updated_at:new Date(Date.now()-9000).toISOString()}],
    support_messages:[{ticket_id:'t1',sender_id:'staff',body:'Nous vérifions <i>votre</i> paiement.',is_internal:false,created_at:now()},{ticket_id:'t1',sender_id:'staff',body:'Note : vérifier Flutterwave',is_internal:true,created_at:new Date(Date.now()+1000).toISOString()}]};
  window.__db=db; window.__fail=null;
  const vis=(t,r)=>STAFF?true: t==='support_tickets'? r.user_id===ME : (!r.is_internal && db.support_tickets.some(x=>x.id===r.ticket_id&&x.user_id===ME));
  const chain=(t)=>{const st={f:[],op:'select',ord:null,row:null,patch:null,single:false};
    const run=()=>{const rows=db[t];
      if(st.op==='insert'){ if(window.__fail) return {data:null,error:{message:window.__fail}};
        const r=Object.assign({id:'n'+(++seq),created_at:now(),updated_at:now()},st.row);
        if(t==='support_tickets'){ r.user_id=ME; r.status='open'; r.priority='normal'; if(rows.filter(x=>x.user_id===ME&&['open','in_progress','waiting_user'].includes(x.status)).length>=5) return {data:null,error:{message:'too_many_open_tickets'}}; }
        else { const tk=db.support_tickets.find(x=>x.id===r.ticket_id); if(tk.status==='closed'&&!STAFF) return {data:null,error:{message:'ticket_closed'}}; r.sender_id=STAFF?'staff':ME; r.is_internal=!!r.is_internal&&STAFF; r.created_at=now(); if(tk.user_id===ME&&!STAFF&&['waiting_user'].includes(tk.status)) tk.status='open'; if(STAFF&&!r.is_internal&&['open'].includes(tk.status)) tk.status='waiting_user'; }
        rows.push(r); return {data:st.single?{id:r.id}:[r],error:null}; }
      let m=rows.filter(r=>vis(t,r)&&st.f.every(f=>r[f[0]]===f[1]));
      if(st.op==='update'){ m.forEach(r=>{ if(!STAFF&&(st.patch.priority||st.patch.assigned_to)) return; Object.assign(r,st.patch,{updated_at:now()}); }); return {data:null,error:null}; }
      if(st.ord) m=m.slice().sort((a,b)=>(a[st.ord[0]]>b[st.ord[0]]?1:-1)*(st.ord[1]?1:-1));
      return {data:m,error:null}; };
    const o={select(){return o},eq(c,v){st.f.push([c,v]);return o},order(c,opt){st.ord=[c,!(opt&&opt.ascending===false)];return o},limit(){return o},insert(r){st.op='insert';st.row=r;return o},update(p){st.op='update';st.patch=p;return o},
      single:async()=>{st.single=true;const r=run();return r.error?r:{data:r.data,error:null}},then(res){res(run())}}; return o;};
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:ME}}}})},rpc:async(n)=>({data:(n==='aldetic_is_staff')?STAFF:null,error:null}),
    from:t=>t==='profiles'?{select:()=>({eq:()=>({single:async()=>({data:{phone_verified:true}}),maybeSingle:async()=>({data:{phone_verified:true}})})})}:chain(t)})};
})();
