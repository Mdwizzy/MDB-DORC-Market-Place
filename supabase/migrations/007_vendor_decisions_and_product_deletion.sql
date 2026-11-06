-- Persist vendor rejection explanations and give vendors an in-app decision notice.
alter table public.vendors add column if not exists rejection_reason text;

create table if not exists public.vendor_notifications (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  created_at timestamptz not null default now()
);
alter table public.vendor_notifications enable row level security;
revoke all on public.vendor_notifications from anon;
grant select on public.vendor_notifications to authenticated;
drop policy if exists "Vendors read own notifications" on public.vendor_notifications;
create policy "Vendors read own notifications" on public.vendor_notifications
  for select to authenticated using (user_id=auth.uid());

create or replace function public.notify_vendor_decision() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    insert into public.vendor_notifications(vendor_id,user_id,title,message)
    values (
      new.id,
      new.user_id,
      case when new.status='approved' then 'Seller application approved' else 'Seller application update' end,
      case when new.status='approved'
        then 'Your seller application for '||new.business_name||' has been approved. You can now submit products.'
        else 'Your seller application for '||new.business_name||' was not approved. Reason: '||coalesce(nullif(trim(new.rejection_reason),''),'Please contact the marketplace team for details.')
      end
    );
  end if;
  return new;
end; $$;
drop trigger if exists notify_vendor_decision on public.vendors;
create trigger notify_vendor_decision after update on public.vendors
  for each row execute function public.notify_vendor_decision();

-- Co-admins may delete the vendor listings and marketplace products they are
-- allowed to edit. Primary admins retain full delete authority.
drop policy if exists "Co-admins delete vendor and own products" on public.products;
create policy "Co-admins delete vendor and own products" on public.products
  for delete to authenticated
  using (public.is_co_admin() and (owner_type='vendor' or created_by=auth.uid()));
