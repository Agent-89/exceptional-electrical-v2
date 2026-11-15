-- Individual technician work reports (additive).
-- One report row per technician per appointment.
-- Shared visit outcome remains on job_appointments.field_*.
-- Does not rewrite or clear existing field_* content.
-- Apply only to local/isolated Supabase — do not push to hosted Production.

create table if not exists public.job_appointment_tech_reports (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.job_appointments(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  staff_id uuid not null references public.scheduling_staff(id) on delete restrict,
  technician_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  work_summary text check (work_summary is null or char_length(work_summary) <= 2000),
  outstanding_work text check (outstanding_work is null or char_length(outstanding_work) <= 2000),
  issues text check (issues is null or char_length(issues) <= 2000),
  follow_up_required boolean not null default false,
  -- Personal progress for this technician (not the shared visit outcome).
  progress_status text not null default 'in_progress'
    check (progress_status in ('in_progress', 'work_completed', 'unable_to_complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_appointment_tech_reports_one_per_tech
    unique (appointment_id, technician_user_id)
);

create index if not exists job_appointment_tech_reports_appointment_idx
  on public.job_appointment_tech_reports(appointment_id, updated_at desc);

create index if not exists job_appointment_tech_reports_job_idx
  on public.job_appointment_tech_reports(job_id, updated_at desc);

create index if not exists job_appointment_tech_reports_tech_idx
  on public.job_appointment_tech_reports(technician_user_id, updated_at desc);

alter table public.job_appointment_tech_reports enable row level security;
revoke all on public.job_appointment_tech_reports from anon, authenticated;
grant all on public.job_appointment_tech_reports to service_role;

-- Compatibility: leave job_appointments.field_* untouched.
-- Existing shared text remains the office-facing overall summary until the
-- office edits/finalises it. Technician saves write only to this table
-- (solo finalisation may also update shared field_status / outcome fields).
