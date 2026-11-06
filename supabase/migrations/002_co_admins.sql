-- Co-admins can operate the marketplace, while only the primary admin can
-- grant/revoke privileged roles or read the admin management screens.
alter type public.marketplace_role add value if not exists 'co_admin';

alter table public.audit_log drop constraint if exists audit_log_actor_id_fkey;
alter table public.audit_log add constraint audit_log_actor_id_fkey foreign key (actor_id) references public.profiles(id) on delete set null;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and (role='admin' or role::text='co_admin'));
$$;

create or replace function public.is_primary_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;

drop policy if exists "Profiles read own or admin" on public.profiles;
create policy "Profiles read own or marketplace admins" on public.profiles for select using (id=auth.uid() or public.is_admin());
drop policy if exists "Admins manage profiles" on public.profiles;
create policy "Primary admin manages profiles" on public.profiles for update using (public.is_primary_admin()) with check (public.is_primary_admin());
drop policy if exists "Co-admins update ordinary profile roles" on public.profiles;
create policy "Co-admins update ordinary profile roles" on public.profiles for update
using (public.is_admin() and role::text not in ('admin','co_admin'))
with check (public.is_primary_admin() or (public.is_admin() and role::text in ('customer','vendor')));

create policy "Primary admin reads audit log" on public.audit_log for select to authenticated using (public.is_primary_admin());
revoke all on public.audit_log from anon,authenticated;
grant select on public.audit_log to authenticated;

create or replace function public.audit_marketplace_change() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id text;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_id := coalesce(v_new->>'id', v_old->>'id');
  insert into public.audit_log(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),lower(tg_op),tg_table_name,v_id,jsonb_build_object('before',v_old,'after',v_new));
  if tg_op='DELETE' then return old; end if;
  return new;
end; $$;

drop trigger if exists audit_profile_changes on public.profiles;
create trigger audit_profile_changes after update on public.profiles for each row
when (old.role is distinct from new.role or old.full_name is distinct from new.full_name or old.phone is distinct from new.phone)
execute function public.audit_marketplace_change();
drop trigger if exists audit_vendor_changes on public.vendors;
create trigger audit_vendor_changes after insert or update or delete on public.vendors for each row execute function public.audit_marketplace_change();
drop trigger if exists audit_product_changes on public.products;
create trigger audit_product_changes after insert or update or delete on public.products for each row execute function public.audit_marketplace_change();
drop trigger if exists audit_order_changes on public.orders;
create trigger audit_order_changes after insert or update or delete on public.orders for each row execute function public.audit_marketplace_change();
drop trigger if exists audit_settlement_changes on public.vendor_settlements;
create trigger audit_settlement_changes after insert or update or delete on public.vendor_settlements for each row execute function public.audit_marketplace_change();

grant execute on function public.is_primary_admin() to authenticated;
