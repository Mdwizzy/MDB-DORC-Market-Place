-- Store presentation metadata for dashboard-created categories.
alter table public.categories
  add column if not exists emoji text not null default '🛍️',
  add column if not exists tone text not null default 'cat-mint';

-- Keep the established storefront icon/color presentation for seeded categories.
update public.categories
set emoji = case slug
  when 'electronics' then '🎧'
  when 'phones-tablets' then '📱'
  when 'computers-accessories' then '💻'
  when 'fashion' then '🧢'
  when 'beauty-personal-care' then '💄'
  when 'health-wellness' then '🩺'
  when 'home-living' then '🪴'
  when 'kitchen-dining' then '🍽️'
  when 'groceries-food' then '🥑'
  when 'baby-kids-toys' then '🧸'
  when 'sports-fitness' then '🏋️'
  when 'books-stationery' then '✏️'
  when 'automotive-tools' then '🔧'
  else emoji
end,
tone = case slug
  when 'electronics' then 'cat-lav'
  when 'phones-tablets' then 'cat-mint'
  when 'computers-accessories' then 'cat-lemon'
  when 'fashion' then 'cat-peach'
  when 'beauty-personal-care' then 'cat-lav'
  when 'health-wellness' then 'cat-mint'
  when 'home-living' then 'cat-mint'
  when 'kitchen-dining' then 'cat-lemon'
  when 'groceries-food' then 'cat-peach'
  when 'baby-kids-toys' then 'cat-lav'
  when 'sports-fitness' then 'cat-mint'
  when 'books-stationery' then 'cat-lemon'
  when 'automotive-tools' then 'cat-peach'
  else tone
end;

grant select on public.categories to anon;
grant select, insert, update, delete on public.categories to authenticated;

drop policy if exists "Admins manage categories" on public.categories;
create policy "Admins manage categories"
  on public.categories
  for all
  to authenticated
  using (public.is_admin() or public.is_co_admin())
  with check (public.is_admin() or public.is_co_admin());
