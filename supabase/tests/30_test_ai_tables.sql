\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e5','e@test'),('00000000-0000-0000-0000-0000000000f6','f@test') on conflict do nothing;
insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000e5'),('00000000-0000-0000-0000-0000000000f6') on conflict do nothing;
insert into public.ai_requests (user_id, provider, model, task, status) values
 ('00000000-0000-0000-0000-0000000000e5','groq','m','chat','ok'),('00000000-0000-0000-0000-0000000000f6','groq','m','chat','ok');
do $$ declare n int; ok boolean := false; begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e5', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select count(*) into n from public.ai_requests; assert n = 1, 'ne voit que ses requêtes IA';
  begin insert into public.ai_requests (provider, model, task, status) values ('x','x','chat','ok'); exception when insufficient_privilege then ok := true; end; assert ok, 'insert interdit';
  ok := false; begin perform 1 from public.ai_provider_state; exception when insufficient_privilege then ok := true; end; assert ok, 'état fournisseurs non lisible';
  reset role;
end $$;
select 'OK 30_test_ai_tables' as result;
