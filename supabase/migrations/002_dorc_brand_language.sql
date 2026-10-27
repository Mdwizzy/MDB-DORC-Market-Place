-- Keep previously seeded sample listings aligned with the DORC brand language.
update public.products
set name = 'Classic Everyday Backpack',
    slug = 'classic-everyday-backpack',
    description = 'A practical everyday backpack selected for the MDB-DORC Market Place.'
where id = '10000000-0000-4000-8000-000000000001'::uuid
  and owner_type = 'platform';
