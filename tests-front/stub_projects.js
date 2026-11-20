(function(){
  const now=()=>new Date().toISOString(); let seq=100;
  const db={
    projects:[
      {id:'p1',owner_id:'u1',slug:'mon-site',name:'Mon site',description:'Vitrine <b>x</b>',visibility:'private',status:'active',updated_at:now()},
      {id:'p2',owner_id:'u2',slug:'public-autre',name:'Projet public autre',description:'',visibility:'public',status:'active',updated_at:now()},
      {id:'p3',owner_id:'u1',slug:'ancien',name:'Ancien',description:'',visibility:'private',status:'archived',updated_at:now()}],
    project_files:[
      {id:'f1',project_id:'p1',path:'index.html',content:'<h1 class="t">Salut</h1>\n<!-- note -->',version:2},
      {id:'f2',project_id:'p1',path:'app.js',content:'const a = 1; // c\nfunction f(){ return "x"; }',version:1},
      {id:'f3',project_id:'p2',path:'README.md',content:'# public',version:1},
      {id:'f4',project_id:'p3',path:'a.txt',content:'archivé',version:1}],
    project_versions:[{file_id:'f1',version:1,content:'<h1>v1</h1>',created_at:now()},{file_id:'f1',version:2,content:'<h1 class="t">Salut</h1>\n<!-- note -->',created_at:now()}]
  };
  window.__db=db; window.__rpc=[];
  const chain=(t)=>{ const st={f:[],op:'select',ord:null,lim:null,patch:null,row:null,sel:false};
    const run=()=>{ const rows=db[t]; 
      if(st.op==='insert'){ const r=Object.assign({id:'n'+(++seq),owner_id:'u1',status:'active',updated_at:now()},st.row);
        if(t==='projects'&&rows.some(x=>x.owner_id==='u1'&&x.slug===r.slug)) return {data:null,error:{message:'duplicate key value violates unique constraint'}};
        if(t==='projects'&&rows.filter(x=>x.owner_id==='u1'&&x.status==='active').length>=20) return {data:null,error:{message:'too_many_projects'}};
        rows.push(r); return {data:st.single?{id:r.id}:[r],error:null}; }
      let m=rows.filter(r=>st.f.every(f=>r[f[0]]===f[1]));
      if(st.op==='update'){ m.forEach(r=>Object.assign(r,st.patch)); return {data:null,error:null}; }
      if(st.ord){ m=m.slice().sort((a,b)=>(a[st.ord[0]]>b[st.ord[0]]?1:-1)*(st.ord[1]?1:-1)); }
      if(st.lim) m=m.slice(0,st.lim);
      return {data:m,error:null}; };
    const o={select(){return o},eq(c,v){st.f.push([c,v]);return o},order(c,opt){st.ord=[c,!(opt&&opt.ascending===false)];return o},limit(n){st.lim=n;return o},
      insert(r){st.op='insert';st.row=r;return o},update(p){st.op='update';st.patch=p;return o},
      single:async()=>{st.single=true;const r=run();return r.error?r:{data:Array.isArray(r.data)?r.data[0]:r.data,error:null}},
      maybeSingle:async()=>{const r=run();return {data:(r.data||[])[0]||null,error:null}},
      then(res){res(run())}}; return o; };
  const owns=(pid)=>{const p=db.projects.find(x=>x.id===pid);return p&&p.owner_id==='u1'?p:null};
  const rpc={
    project_file_save:(a)=>{const p=owns(a.p_project); if(!p) return {ok:false,reason:'forbidden'}; if(p.status!=='active') return {ok:false,reason:'archived'};
      if(!/^[A-Za-z0-9._\/-]{1,200}$/.test(a.p_path)||a.p_path.includes('..')||a.p_path.startsWith('/')) return {ok:false,reason:'invalid_path'};
      if(a.p_content.length>500000) return {ok:false,reason:'too_large'};
      let f=db.project_files.find(x=>x.project_id===a.p_project&&x.path===a.p_path);
      if(f){ if(a.p_expected!==f.version) return {ok:false,reason:'conflict',current:f.version}; f.version++; f.content=a.p_content; }
      else { if(a.p_expected!==null) return {ok:false,reason:'not_found'}; f={id:'f'+(++seq),project_id:a.p_project,path:a.p_path,content:a.p_content,version:1}; db.project_files.push(f); }
      db.project_versions.push({file_id:f.id,version:f.version,content:a.p_content,created_at:now()}); return {ok:true,version:f.version}; },
    project_file_rename:(a)=>{ if(!owns(a.p_project)) return {ok:false,reason:'forbidden'}; if(db.project_files.some(x=>x.project_id===a.p_project&&x.path===a.p_to)) return {ok:false,reason:'exists'};
      const f=db.project_files.find(x=>x.project_id===a.p_project&&x.path===a.p_from); if(!f) return {ok:false,reason:'not_found'}; f.path=a.p_to; return {ok:true}; },
    project_file_delete:(a)=>{ if(!owns(a.p_project)) return {ok:false,reason:'forbidden'}; const i=db.project_files.findIndex(x=>x.project_id===a.p_project&&x.path===a.p_path); if(i<0) return {ok:false,reason:'not_found'}; db.project_files.splice(i,1); return {ok:true}; }
  };
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'u1'}}}})},
    from:t=>t==='profiles'?{select:()=>({eq:()=>({single:async()=>({data:{phone_verified:true}}),maybeSingle:async()=>({data:{phone_verified:true}})})})}:chain(t),
    rpc:async(n,a)=>{window.__rpc.push([n,a]);return {data:rpc[n](a),error:null};}})};
})();
