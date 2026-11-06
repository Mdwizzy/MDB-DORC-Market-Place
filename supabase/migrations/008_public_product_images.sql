-- Product photos are public catalog content; make their URLs readable to shoppers
-- without requiring a logged-in Supabase Storage session.
update storage.buckets
set public = true
where id = 'product-images';
