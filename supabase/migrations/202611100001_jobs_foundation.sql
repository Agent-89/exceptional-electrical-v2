-- Exceptional Electrical HQ: additive jobs foundation. No historical records are imported.
create sequence if not exists public.job_reference_seq start with 1712;
create table if not exists public.jobs (
 id uuid primary key default gen_random_uuid(),
 job_number bigint not null unique default nextval('public.job_reference_seq'),
 title text not null check (char_length(trim(title)) between 2 and 200),
 description text,
 customer_id uuid references public.customers(id) on delete restrict,
 site_address_id uuid references public.customer_addresses(id) on delete set null,
 enquiry_id uuid references public.enquiries(id) on delete set null,
 quote_id uuid references public.quotes(id) on delete set null,
 status text not null default 'unassigned' check (status in ('unassigned','scheduled','in_progress','on_hold','completed','cancelled')),
 priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
 site_address_text text,
 assigned_to uuid references public.staff_profiles(user_id) on delete set null,
 scheduled_start timestamptz,
 scheduled_end timestamptz,
 due_at timestamptz,
 completed_at timestamptz,
 next_action_at timestamptz,
 next_action_note text,
 tradify_id text unique,
 tradify_reference text unique,
 source text not null default 'hq' check (source in ('hq','tradify')),
 imported_at timestamptz,
 created_by uuid references public.staff_profiles(user_id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint job_schedule_order check (scheduled_end is null or scheduled_start is not null and scheduled_end > scheduled_start)
);
create index if not exists jobs_status_updated_idx on public.jobs(status,updated_at desc);
create index if not exists jobs_customer_idx on public.jobs(customer_id);
create index if not exists jobs_assignee_schedule_idx on public.jobs(assigned_to,scheduled_start);
create table if not exists public.job_activity (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null references public.jobs(id) on delete cascade,
 actor_id uuid references public.staff_profiles(user_id) on delete set null,
 action text not null,
 note text,
 created_at timestamptz not null default now()
);
create index if not exists job_activity_job_idx on public.job_activity(job_id,created_at desc);
alter table public.jobs enable row level security;
alter table public.job_activity enable row level security;
-- No client-facing policies: only the existing authenticated HQ server-side access layer may access these tables.
revoke all on public.jobs, public.job_activity from anon, authenticated;
revoke all on sequence public.job_reference_seq from anon, authenticated;
