alter table public.enquiries add column if not exists suburb text check (suburb is null or length(suburb)<=120);
alter table public.enquiries add column if not exists contact_preference text not null default 'either' check (contact_preference in ('either','phone','email'));
