create table if not exists public.job_assignments(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs(id) on delete cascade,staff_id uuid not null references public.staff_profiles(user_id) on delete cascade,created_at timestamptz not null default now(),unique(job_id,staff_id));
create index if not exists job_assignments_staff_idx on public.job_assignments(staff_id);
create table if not exists public.job_appointments(id uuid primary key default gen_random_uuid(),job_id uuid not null references public.jobs(id) on delete cascade,starts_at timestamptz not null,ends_at timestamptz not null,notes text,status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),created_at timestamptz not null default now(),check(ends_at>starts_at));
create index if not exists job_appointments_start_idx on public.job_appointments(starts_at);
alter table public.job_assignments enable row level security;
alter table public.job_appointments enable row level security;
revoke all on public.job_assignments,public.job_appointments from anon,authenticated;