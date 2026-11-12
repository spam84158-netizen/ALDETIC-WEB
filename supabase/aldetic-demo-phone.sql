-- 11) Vérification téléphonique simulée Aldetic (démo uniquement, aucun SMS réel).
alter table public.profiles
  add column if not exists phone_verified boolean not null default false;

create or replace function public.aldetic_confirm_demo_phone()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  update public.profiles
     set phone_verified = true
   where id = auth.uid()
     and phone is not null
     and length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 8;
  if not found then
    raise exception 'Enregistrez un numéro valide avant la confirmation';
  end if;
end;
$$;
revoke all on function public.aldetic_confirm_demo_phone() from public;
grant execute on function public.aldetic_confirm_demo_phone() to authenticated;
