(function(){
  const ADMIN=!!window.__ADMIN; const now=()=>new Date().toISOString();
  const db={
    deposits:[{id:'d1',user_id:'11111111-aaaa',provider:'bank',method:'bank_transfer',amount_minor:10000,currency:'XOF',internal_ref:'DEP-AAAAAAAAAAAAAAAA',provider_ref:null,status:'pending',provider_response:null,reject_reason:null,created_at:now()},
              {id:'d2',user_id:'22222222-bbbb',provider:'flutterwave',method:'wave',amount_minor:5000,currency:'XOF',internal_ref:'DEP-BBBBBBBBBBBBBBBB',provider_ref:'99',status:'confirmed',provider_response:{status:'successful',note:'<img src=x onerror=window.__xss=1>'},reject_reason:null,created_at:now()}],
    withdrawals:[{id:'11111111-1111-1111-1111-111111111111',user_id:'11111111-aaaa',method:'wave',destination:{phone:'+2250700000001'},amount_minor:6000,fee_minor:120,status:'requested',decision_reason:null,created_at:now()},
                 {id:'22222222-2222-2222-2222-222222222222',user_id:'22222222-bbbb',method:'bank_transfer',destination:{iban:'FR7630006000011234567890189',holder:'<b>Awa</b>'},amount_minor:9000,fee_minor:0,status:'approved',decision_reason:null,created_at:now()}],
    finance_audit:[{id:1,actor:null,action:'deposit_confirmed',target_type:'deposit',details:{provider_ref:'99'},at:now()}],
    platform_settings:[{key:'payment_methods',value:{orange_money:false,mtn_momo:false,moov_money:false,wave:true,card:false,bank_transfer:true}},{key:'withdraw_fee',value:{percent:2,min:100}},{key:'deposit_min',value:500},{key:'withdraw_min',value:1000},{key:'bank_instructions',value:{Banque:'Banque X'}}]
  };
  window.__db=db; window.__calls=[];
  const chain=(t)=>{const st={f:[],op:'select',patch:null};const run=()=>{ if(!ADMIN) return {data:[],error:null}; const rows=db[t]; let m=rows.filter(r=>st.f.every(f=>r[f[0]]===f[1])); if(st.op==='update'){m.forEach(r=>Object.assign(r,st.patch));return {data:null,error:null};} return {data:m,error:null}; };
    const o={select(){return o},order(){return o},limit(){return o},eq(c,v){st.f.push([c,v]);return o},update(p){st.op='update';st.patch=p;return o},then(res){res(run())}};return o;};
  const fail=(c)=>({data:null,error:{context:{json:async()=>({error:c})}}});
  const act=(b)=>{ window.__calls.push(b);
    if(b.action==='confirm_bank_deposit'){ const d=db.deposits.find(x=>x.internal_ref===b.internal_ref); if(b.bank_reference.length<4) return fail('bank_reference_required'); if(b.amount!==d.amount_minor) return fail('amount_or_currency_mismatch'); d.status='confirmed'; d.provider_ref='bank:'+b.bank_reference; return {data:{ok:true},error:null}; }
    const w=db.withdrawals.find(x=>x.id===b.id);
    if(b.action==='approve_withdrawal'){ if(w.status!=='requested') return fail('invalid_transition'); w.status='approved'; return {data:{ok:true},error:null}; }
    if(b.action==='reject_withdrawal'){ if(!(b.reason||'').trim()) return fail('reason_required'); w.status='rejected'; w.decision_reason=b.reason; return {data:{ok:true},error:null}; }
    if(b.action==='pay_withdrawal'){ if(w.status!=='approved') return fail('invalid_transition'); if(b.mode==='manual'){ if(!(b.provider_ref||'').trim()) return fail('provider_ref_required'); w.status='paid'; return {data:{ok:true},error:null}; } if(window.__noProvider) return fail('provider_not_configured'); if(!w.destination.phone) return fail('auto_payout_needs_mobile_destination'); return {data:{ok:true,pending_confirmation:true},error:null}; }
    return fail('unknown_action'); };
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{user:{id:'adm'}}}})},rpc:async(n)=>({data:n==='aldetic_is_admin'?ADMIN:null,error:null}),
    from:t=>t==='profiles'?{select:()=>({eq:()=>({single:async()=>({data:{phone_verified:true}}),maybeSingle:async()=>({data:{phone_verified:true}})})})}:chain(t),
    functions:{invoke:async(n,{body})=>act(body)}})};
})();
