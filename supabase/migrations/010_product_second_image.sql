-- Allow marketplace listings to include up to two product photos.
-- Existing products keep their primary photo in image_path.
alter table public.products
  add column if not exists image_path_2 text;
