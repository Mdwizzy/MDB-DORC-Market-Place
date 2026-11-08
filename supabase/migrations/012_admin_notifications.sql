-- Keep administrators informed of new seller applications and vendor listings.
create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('vendor_application', 'vendor_product_submission')),
  title text not null,
  message text not null,
  vendor_id uuid references public.vendors(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists admin_notifications_recipient_created_idx
  on public.admin_notifications(recipient_id, created_at desc);

alter table public.admin_notifications enable row level security;
revoke all on public.admin_notifications from anon, authenticated;
grant select on public.admin_notifications to authenticated;
grant update (read_at) on public.admin_notifications to authenticated;

drop policy if exists "Admins read own notifications" on public.admin_notifications;
create policy "Admins read own notifications"
  on public.admin_notifications for select to authenticated
  using (recipient_id = auth.uid() and public.is_admin());

drop policy if exists "Admins mark own notifications read" on public.admin_notifications;
create policy "Admins mark own notifications read"
  on public.admin_notifications for update to authenticated
  using (recipient_id = auth.uid() and public.is_admin())
  with check (recipient_id = auth.uid() and public.is_admin());

create or replace function public.create_admin_submission_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text;
  v_title text;
  v_message text;
  v_vendor_id uuid;
  v_product_id uuid;
  v_business_name text;
begin
  if tg_table_name = 'vendors' then
    if new.status <> 'pending' then return new; end if;
    v_event := 'vendor_application';
    v_title := 'New vendor application';
    v_message := new.business_name || ' applied to sell on MDB-DORC Market Place. The application is waiting for review.';
    v_vendor_id := new.id;
  else
    if new.vendor_id is null or new.status <> 'pending' then return new; end if;
    select business_name into v_business_name from public.vendors where id = new.vendor_id;
    v_event := 'vendor_product_submission';
    v_title := 'Vendor product submitted';
    v_message := new.name || ' was submitted by ' || coalesce(v_business_name, 'a vendor') || ' and is waiting for product approval.';
    v_vendor_id := new.vendor_id;
    v_product_id := new.id;
  end if;

  insert into public.admin_notifications(recipient_id, event_type, title, message, vendor_id, product_id)
  select id, v_event, v_title, v_message, v_vendor_id, v_product_id
  from public.profiles
  where role::text in ('admin', 'co_admin');

  return new;
end;
$$;

drop trigger if exists notify_admin_new_vendor_application on public.vendors;
create trigger notify_admin_new_vendor_application
  after insert on public.vendors
  for each row execute function public.create_admin_submission_notifications();

drop trigger if exists notify_admin_new_vendor_product on public.products;
create trigger notify_admin_new_vendor_product
  after insert on public.products
  for each row execute function public.create_admin_submission_notifications();

-- Let an open admin dashboard receive new unread alerts without reloading.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'admin_notifications'
  ) then
    alter publication supabase_realtime add table public.admin_notifications;
  end if;
end;
$$;
