-- Save the contact phone number supplied with each seller application.
alter table public.vendors
  add column if not exists contact_phone text;
