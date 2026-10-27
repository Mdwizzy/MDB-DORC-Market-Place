create extension if not exists pgcrypto;

create type public.marketplace_role as enum ('customer','vendor','admin','pickup_staff');
create type public.product_status as enum ('draft','pending','approved','rejected','changes_requested','archived');
create type public.order_status as enum ('pending_payment','paid','processing','ready_for_pickup','completed','cancelled','refunded');
create type public.payment_status as enum ('pending','success','failed','refunded');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '', phone text,
  role public.marketplace_role not null default 'customer',
  created_at timestamptz not null default now()
);
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,full_name,role) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),'customer') on conflict(id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
create table public.vendors (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles(id) on delete cascade,
  business_name text not null, description text, contact_email text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  commission_percent numeric(5,2) not null default 10 check (commission_percent between 0 and 100),
  created_at timestamptz not null default now()
);
create table public.categories (id uuid primary key default gen_random_uuid(), name text not null unique, slug text not null unique, active boolean not null default true);
create table public.products (
  id uuid primary key default gen_random_uuid(), vendor_id uuid references public.vendors(id) on delete restrict,
  owner_type text not null check (owner_type in ('platform','vendor')),
  name text not null, slug text not null unique, description text not null default '',
  category_id uuid references public.categories(id), price_ngn integer not null check (price_ngn > 0),
  stock integer not null default 0 check (stock >= 0), image_path text,
  status public.product_status not null default 'pending', featured boolean not null default false,
  rating numeric(2,1) not null default 0 check(rating between 0 and 5), review_count integer not null default 0 check(review_count>=0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint owner_consistency check ((owner_type='platform' and vendor_id is null) or (owner_type='vendor' and vendor_id is not null))
);
create table public.product_reviews (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  customer_id uuid not null references public.profiles(id), rating integer not null check(rating between 1 and 5), body text,
  created_at timestamptz not null default now(), unique(product_id, customer_id)
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.profiles(id),
  pickup_name text not null check (pickup_name in ('E-Block','MSB Site Office')),
  status public.order_status not null default 'pending_payment', subtotal_ngn integer not null,
  total_amount integer not null, created_at timestamptz not null default now(), paid_at timestamptz
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id), vendor_id uuid references public.vendors(id),
  product_name text not null, unit_price_ngn integer not null, quantity integer not null check(quantity > 0),
  commission_ngn integer not null default 0, vendor_net_ngn integer not null default 0
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  provider text not null default 'paystack', reference text not null unique, amount integer not null,
  currency text not null default 'NGN', status public.payment_status not null default 'pending',
  provider_response jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.vendor_settlements (
  id uuid primary key default gen_random_uuid(), vendor_id uuid not null references public.vendors(id),
  amount_ngn integer not null check(amount_ngn > 0), status text not null default 'pending' check(status in ('pending','paid','failed')),
  method text, reference text, paid_at timestamptz, created_at timestamptz not null default now()
);
create table public.audit_log (
  id bigint generated always as identity primary key, actor_id uuid references public.profiles(id),
  action text not null, entity_type text not null, entity_id text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);

create or replace view public.vendor_public_profiles with (security_barrier=true) as
  select id,business_name from public.vendors where status='approved';
grant select on public.vendor_public_profiles to anon,authenticated;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;
create or replace function public.is_vendor_order(p_order_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.order_items i join public.vendors v on v.id=i.vendor_id where i.order_id=p_order_id and v.user_id=auth.uid());
$$;
create or replace function public.is_customer_order(p_order_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.orders o where o.id=p_order_id and o.customer_id=auth.uid());
$$;

create or replace function public.create_pending_marketplace_order(p_customer_id uuid, p_pickup_name text, p_items jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_order_id uuid; v_item jsonb; v_product public.products%rowtype; v_qty integer; v_subtotal integer := 0; v_commission integer;
begin
  if p_customer_id is null or p_pickup_name not in ('E-Block','MSB Site Office') then raise exception 'Invalid customer or pickup location'; end if;
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

create or replace function public.confirm_marketplace_payment(p_payment_id uuid, p_provider_response jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_order uuid;
begin
  select order_id into v_order from public.payments where id=p_payment_id for update;
  if v_order is null then raise exception 'Payment not found'; end if;
  update public.payments set status='success',provider_response=p_provider_response,updated_at=now() where id=p_payment_id and status='pending';
  if found then update public.orders set status='paid',paid_at=now() where id=v_order and status='pending_payment'; end if;
end; $$;

create or replace function public.cancel_pending_marketplace_order(p_order_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_status public.order_status;
begin
  select status into v_status from public.orders where id=p_order_id for update;
  if v_status='pending_payment' then
    update public.orders set status='cancelled' where id=p_order_id;
    update public.products p set stock=p.stock+i.quantity from public.order_items i where i.order_id=p_order_id and p.id=i.product_id;
  end if;
end; $$;

alter table public.profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_reviews enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.vendor_settlements enable row level security;
alter table public.audit_log enable row level security;

create policy "Profiles read own or admin" on public.profiles for select using (id=auth.uid() or public.is_admin());
create policy "Customers update own profile" on public.profiles for update using (id=auth.uid() and role='customer') with check (id=auth.uid() and role='customer');
create policy "Admins manage profiles" on public.profiles for update using (public.is_admin()) with check (public.is_admin());
create policy "Users apply as vendors" on public.vendors for insert with check (user_id=auth.uid() and status='pending');
create policy "Users read own vendor application" on public.vendors for select using (user_id=auth.uid() or public.is_admin());
create policy "Admins manage vendors" on public.vendors for all using (public.is_admin()) with check (public.is_admin());
create policy "Public sees active categories" on public.categories for select using (active=true);
create policy "Public sees approved products" on public.products for select using (status='approved' or public.is_admin());
create policy "Vendors see their own products" on public.products for select using (vendor_id in (select id from public.vendors where user_id=auth.uid()));
create policy "Vendors insert draft submissions" on public.products for insert with check (owner_type='vendor' and status in ('draft','pending') and vendor_id in (select id from public.vendors where user_id=auth.uid() and status='approved'));
create policy "Vendors edit their unapproved products" on public.products for update using (vendor_id in (select id from public.vendors where user_id=auth.uid()) and status in ('draft','rejected','changes_requested')) with check (vendor_id in (select id from public.vendors where user_id=auth.uid()) and status in ('draft','pending'));
create policy "Admins manage products" on public.products for all using (public.is_admin()) with check (public.is_admin());
create policy "Customers and vendors see relevant orders" on public.orders for select using (customer_id=auth.uid() or public.is_admin() or public.is_vendor_order(id));
create policy "Admins update orders" on public.orders for update using (public.is_admin()) with check (public.is_admin());
create policy "Customers and vendors see relevant order items" on public.order_items for select using (public.is_customer_order(order_id) or public.is_admin() or vendor_id in (select id from public.vendors where user_id=auth.uid()));
create policy "Customers see own payment records" on public.payments for select using (order_id in (select id from public.orders where customer_id=auth.uid()) or public.is_admin());
create policy "Vendors see own settlement records" on public.vendor_settlements for select using (vendor_id in (select id from public.vendors where user_id=auth.uid()) or public.is_admin());
create policy "Admins create settlement records" on public.vendor_settlements for insert with check (public.is_admin());
create policy "Public reads reviews" on public.product_reviews for select using (true);
create policy "Customers create their own reviews" on public.product_reviews for insert with check (customer_id=auth.uid() and exists(select 1 from public.orders o join public.order_items i on i.order_id=o.id where o.customer_id=auth.uid() and o.status in ('paid','processing','ready_for_pickup','completed') and i.product_id=product_reviews.product_id));

revoke all on public.profiles,public.vendors,public.products,public.orders,public.order_items,public.payments,public.vendor_settlements,public.audit_log from anon;
grant select on public.categories,public.products,public.product_reviews to anon,authenticated;
grant select,update on public.profiles to authenticated;
grant update on public.orders to authenticated;
grant insert on public.vendor_settlements to authenticated;
grant select,insert,update,delete on public.vendors to authenticated;
grant select,insert,update,delete on public.products to authenticated;
grant select,insert on public.product_reviews to authenticated;
grant select on public.vendors,public.orders,public.order_items,public.payments,public.vendor_settlements to authenticated;
revoke all on function public.create_pending_marketplace_order(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.confirm_marketplace_payment(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.cancel_pending_marketplace_order(uuid) from public,anon,authenticated;
grant execute on function public.create_pending_marketplace_order(uuid,text,jsonb) to service_role;
grant execute on function public.confirm_marketplace_payment(uuid,jsonb) to service_role;
grant execute on function public.cancel_pending_marketplace_order(uuid) to service_role;

insert into public.categories(name,slug) values
('Electronics','electronics'),('Fashion','fashion'),('Home & Living','home-living'),('Books & Stationery','books-stationery')
on conflict do nothing;

insert into public.products(id,owner_type,name,slug,description,category_id,price_ngn,stock,status,featured)
select seed.id,'platform',seed.name,seed.slug,'A curated find from MDB-DORC Market Place.',c.id,seed.price,seed.stock,'approved',seed.featured
from (values
 ('10000000-0000-4000-8000-000000000001'::uuid,'Classic Everyday Backpack','classic-everyday-backpack','fashion',18500,18,true),
 ('10000000-0000-4000-8000-000000000002'::uuid,'Wireless Bluetooth Earbuds','wireless-bluetooth-earbuds','electronics',12500,12,true),
 ('10000000-0000-4000-8000-000000000003'::uuid,'Stainless Steel Water Bottle','stainless-steel-water-bottle','home-living',8500,25,false),
 ('10000000-0000-4000-8000-000000000004'::uuid,'Everyday Tote Bag','everyday-tote-bag','fashion',7000,9,false),
 ('10000000-0000-4000-8000-000000000005'::uuid,'Portable Desk Lamp','portable-desk-lamp','home-living',15000,7,false),
 ('10000000-0000-4000-8000-000000000006'::uuid,'Insulated Lunch Box','insulated-lunch-box','home-living',9500,14,false),
 ('10000000-0000-4000-8000-000000000007'::uuid,'Daily Notes Journal Set','daily-notes-journal-set','books-stationery',5500,32,true),
 ('10000000-0000-4000-8000-000000000008'::uuid,'Classic Analog Wristwatch','classic-analog-wristwatch','fashion',22000,5,false)
) as seed(id,name,slug,category_slug,price,stock,featured)
join public.categories c on c.slug=seed.category_slug
on conflict(id) do nothing;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('product-images','product-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy "Read approved product images or own uploads" on storage.objects for select using (bucket_id='product-images' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin() or exists(select 1 from public.products where image_path=name and status='approved')));
create policy "Admins upload product images" on storage.objects for insert to authenticated with check (bucket_id='product-images' and public.is_admin());
create policy "Approved vendors upload own product images" on storage.objects for insert to authenticated with check (bucket_id='product-images' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.vendors where user_id=auth.uid() and status='approved'));

-- After creating the first admin profile securely in Supabase, promote it in SQL:
-- update public.profiles set role='admin' where id='<trusted-auth-user-uuid>';
