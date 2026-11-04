-- Exceptional Electrical V2: clean, isolated operational schema.
create extension if not exists pgcrypto;
create type public.staff_role as enum ('owner','admin','office','technician');
create type public.enquiry_status as enum ('new','contacted','qualified','scheduled','closed','spam');
create type public.enquiry_service as enum ('residential','commercial','lighting','maintenance','other');

create table public.staff_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null check (length(trim(full_name)) between 2 and 120),
 role public.staff_role not null default 'technician',
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.customers (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name))>1),
 email text,
 phone text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.enquiries (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 phone text not null,
 email text not null,
 service public.enquiry_service not null,
 message text not null,
 source text not null default 'website',
 status public.enquiry_status not null default 'new',
 customer_id uuid references public.customers(id) on delete set null,
 assigned_to uuid references public.staff_profiles(user_id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index enquiries_status_created_idx on public.enquiries(status,created_at desc);
create index enquiries_customer_idx on public.enquiries(customer_id);
create table public.enquiry_activity (
 id uuid primary key default gen_random_uuid(),
 enquiry_id uuid not null references public.enquiries(id) on delete cascade,
 actor_id uuid references public.staff_profiles(user_id) on delete set null,
 action text not null,
 note text,
 created_at timestamptz not null default now()
);
create index enquiry_activity_enquiry_idx on public.enquiry_activity(enquiry_id,created_at desc);

-- The helper lives in a non-exposed schema and checks DB-controlled staff membership.
create schema if not exists private;
create or replace function private.is_staff()
returns boolean language sql stable security definer
set search_path = '' as $$
 select exists(select 1 from public.staff_profiles where user_id=(select auth.uid()) and active);
$$;
revoke all on function private.is_staff() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_staff() to authenticated;

alter table public.staff_profiles enable row level security;
alter table public.customers enable row level security;
alter table public.enquiries enable row level security;
alter table public.enquiry_activity enable row level security;

create policy "staff read own profile" on public.staff_profiles for select to authenticated using (user_id=(select auth.uid()));
create policy "staff read customers" on public.customers for select to authenticated using ((select private.is_staff()));
create policy "staff insert customers" on public.customers for insert to authenticated with check ((select private.is_staff()));
create policy "staff update customers" on public.customers for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "staff read enquiries" on public.enquiries for select to authenticated using ((select private.is_staff()));
create policy "staff update enquiries" on public.enquiries for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "staff read enquiry activity" on public.enquiry_activity for select to authenticated using ((select private.is_staff()));
create policy "staff insert enquiry activity" on public.enquiry_activity for insert to authenticated with check ((select private.is_staff()) and actor_id=(select auth.uid()));

grant select on public.staff_profiles to authenticated;
grant select,insert,update on public.customers to authenticated;
grant select,update on public.enquiries to authenticated;
grant select,insert on public.enquiry_activity to authenticated;
-- Public visitors cannot query or insert these tables directly. The validated server endpoint inserts via secret key.
revoke all on public.staff_profiles,public.customers,public.enquiries,public.enquiry_activity from anon;
