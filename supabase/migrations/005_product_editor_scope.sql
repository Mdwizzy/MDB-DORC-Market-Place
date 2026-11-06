-- Track who created platform-owned products so co-admins can edit their own,
-- plus vendor-owned products, while the primary admin retains full control.
alter table public.products
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

create or replace function public.is_co_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role::text='co_admin');
$$;

create or replace function public.set_product_creator() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if new.created_by is null then new.created_by := auth.uid(); end if;
  else
    new.created_by := old.created_by;
    if not public.is_primary_admin() then
      new.owner_type := old.owner_type;
      new.vendor_id := old.vendor_id;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists set_product_creator on public.products;
create trigger set_product_creator before insert or update on public.products
for each row execute function public.set_product_creator();

drop policy if exists "Admins manage products" on public.products;
drop policy if exists "Primary admins manage all products" on public.products;
create policy "Primary admins manage all products" on public.products for all to authenticated
using (public.is_primary_admin()) with check (public.is_primary_admin());

drop policy if exists "Co-admins read all products" on public.products;
create policy "Co-admins read all products" on public.products for select to authenticated
using (public.is_co_admin());

drop policy if exists "Co-admins add own marketplace products" on public.products;
create policy "Co-admins add own marketplace products" on public.products for insert to authenticated
with check (public.is_co_admin() and owner_type='platform' and vendor_id is null and created_by=auth.uid());

drop policy if exists "Co-admins edit vendor and own products" on public.products;
create policy "Co-admins edit vendor and own products" on public.products for update to authenticated
using (public.is_co_admin() and (owner_type='vendor' or created_by=auth.uid()))
with check (public.is_co_admin() and (owner_type='vendor' or (owner_type='platform' and vendor_id is null and created_by=auth.uid())));

grant execute on function public.is_co_admin() to authenticated;
