insert into public.categories(name,slug) values
  ('Phones & Tablets','phones-tablets'),
  ('Computers & Accessories','computers-accessories'),
  ('Beauty & Personal Care','beauty-personal-care'),
  ('Health & Wellness','health-wellness'),
  ('Kitchen & Dining','kitchen-dining'),
  ('Groceries & Food','groceries-food'),
  ('Baby, Kids & Toys','baby-kids-toys'),
  ('Sports & Fitness','sports-fitness'),
  ('Automotive & Tools','automotive-tools')
on conflict (slug) do update set name=excluded.name,active=true;
