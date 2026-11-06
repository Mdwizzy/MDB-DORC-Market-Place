-- Shoppers can browse approved products without an account. Keep orders and
-- checkout protected by their existing authenticated policies and API checks.
grant select on public.products, public.categories, public.vendor_public_profiles to anon, authenticated;

drop policy if exists "Public sees approved products" on public.products;
drop policy if exists "Anyone can browse approved products" on public.products;
create policy "Anyone can browse approved products" on public.products
  for select to anon, authenticated
  using (status = 'approved');
