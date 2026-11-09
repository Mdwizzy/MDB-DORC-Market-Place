-- Store pickup points centrally so admins can manage them without code changes.
create table if not exists public.pickup_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists pickup_locations_name_lower_idx
  on public.pickup_locations (lower(name));

insert into public.pickup_locations (name, active)
values ('E-Block', true), ('MSB Site Office', true)
on conflict do nothing;

alter table public.pickup_locations enable row level security;
revoke all on public.pickup_locations from anon, authenticated;
grant select on public.pickup_locations to anon, authenticated;
grant insert, update on public.pickup_locations to authenticated;

drop policy if exists "Anyone sees active pickup locations" on public.pickup_locations;
create policy "Anyone sees active pickup locations"
  on public.pickup_locations for select to anon, authenticated
  using (active or public.is_admin());

drop policy if exists "Admins manage pickup locations" on public.pickup_locations;
create policy "Admins manage pickup locations"
  on public.pickup_locations for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Orders keep the location name as a historical snapshot, so hiding a location
-- does not alter existing orders.
alter table public.orders drop constraint if exists orders_pickup_name_check;

create or replace function public.create_pending_marketplace_order(p_customer_id uuid, p_pickup_name text, p_items jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_order_id uuid; v_item jsonb; v_product public.products%rowtype; v_qty integer; v_subtotal integer := 0; v_commission integer;
begin
  if p_customer_id is null or p_pickup_name is null or not exists (select 1 from public.pickup_locations where name=p_pickup_name and active) then
    raise exception 'Invalid customer or pickup location';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then raise exception 'Invalid cart'; end if;
  insert into public.orders(customer_id,pickup_name,subtotal_ngn,total_amount) values(p_customer_id,p_pickup_name,0,0) returning id into v_order_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 25 then raise exception 'Invalid quantity'; end if;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and status='approved' for update;
    if not found or v_product.stock < v_qty then raise exception 'Product unavailable or insufficient stock'; end if;
    update public.products set stock=stock-v_qty where id=v_product.id;
    v_commission := case when v_product.vendor_id is null then 0 else round(v_product.price_ngn*v_qty*(select commission_percent/100 from public.vendors where id=v_product.vendor_id))::integer end;
    insert into public.order_items(order_id,product_id,vendor_id,product_name,unit_price_ngn,quantity,commission_ngn,vendor_net_ngn)
      values(v_order_id,v_product.id,v_product.vendor_id,v_product.name,v_product.price_ngn,v_qty,v_commission,(v_product.price_ngn*v_qty)-v_commission);
    v_subtotal := v_subtotal + v_product.price_ngn*v_qty;
  end loop;
  update public.orders set subtotal_ngn=v_subtotal,total_amount=v_subtotal where id=v_order_id;
  return v_order_id;
exception when others then
  if v_order_id is not null then delete from public.orders where id=v_order_id; end if;
  raise;
end; $$;
