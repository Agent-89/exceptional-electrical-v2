-- Technician Milestone 2: field operations (additive, backward-compatible).
-- Does not modify existing customer/job rows. Do not apply to hosted without approval.

-- Field progress is separate from scheduling status so office dispatch
-- (status = 'scheduled') keeps working while technicians mark visit progress.
alter table public.job_appointments
  add column if not exists field_status text not null default 'scheduled';

alter table public.job_appointments
  drop constraint if exists job_appointments_field_status_check;

alter table public.job_appointments
  add constraint job_appointments_field_status_check
  check (field_status in ('scheduled','in_progress','paused','work_completed','unable_to_complete'));

alter table public.job_appointments
  add column if not exists field_completed_at timestamptz;

alter table public.job_appointments
  add column if not exists field_completion_note text;

alter table public.job_appointments
  add column if not exists field_outstanding_work text;

alter table public.job_appointments
  add column if not exists field_issues text;

alter table public.job_appointments
  add column if not exists field_follow_up_required boolean not null default false;

create index if not exists job_appointments_field_status_idx
  on public.job_appointments(field_status);

-- Job-linked time entries (server-authoritative timer + manual corrections).
create table if not exists public.job_time_entries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  appointment_id uuid references public.job_appointments(id) on delete set null,
  staff_id uuid not null references public.scheduling_staff(id) on delete restrict,
  technician_user_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  started_at timestamptz not null,
  ended_at timestamptz,
  break_started_at timestamptz,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  worked_minutes integer check (worked_minutes is null or worked_minutes >= 0),
  billable_minutes integer check (billable_minutes is null or billable_minutes >= 0),
  status text not null default 'active'
    check (status in ('active','on_break','submitted','approved','rejected','corrected','cancelled')),
  entry_source text not null default 'timer' check (entry_source in ('timer','manual')),
  note text check (note is null or char_length(note) <= 2000),
  original_started_at timestamptz,
  original_ended_at timestamptz,
  original_break_minutes integer,
  original_worked_minutes integer,
  approved_by uuid references public.staff_profiles(user_id) on delete set null,
  approved_at timestamptz,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 2000),
  correction_note text check (correction_note is null or char_length(correction_note) <= 2000),
  corrected_by uuid references public.staff_profiles(user_id) on delete set null,
  corrected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  check (
    (status in ('active','on_break') and ended_at is null)
    or (status not in ('active','on_break'))
  ),
  check (
    (status = 'on_break' and break_started_at is not null)
    or (status <> 'on_break' and break_started_at is null)
  )
);

create index if not exists job_time_entries_job_idx on public.job_time_entries(job_id, started_at desc);
create index if not exists job_time_entries_appointment_idx on public.job_time_entries(appointment_id, started_at desc);
create index if not exists job_time_entries_tech_day_idx on public.job_time_entries(technician_user_id, started_at desc);
create index if not exists job_time_entries_status_idx on public.job_time_entries(status, started_at desc);
create index if not exists job_time_entries_staff_idx on public.job_time_entries(staff_id, started_at desc);

-- At most one live timer session per technician across all jobs.
create unique index if not exists job_time_entries_one_active_per_tech
  on public.job_time_entries(technician_user_id)
  where status in ('active','on_break');

alter table public.job_time_entries enable row level security;
revoke all on public.job_time_entries from anon, authenticated;
grant all on public.job_time_entries to service_role;

-- Shared / office-only notes (technicians write shared notes only).
create table if not exists public.job_notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  appointment_id uuid references public.job_appointments(id) on delete set null,
  author_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  visibility text not null default 'shared' check (visibility in ('shared','office_only')),
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  edited_by uuid references public.staff_profiles(user_id) on delete set null
);

create index if not exists job_notes_job_idx on public.job_notes(job_id, created_at desc);
create index if not exists job_notes_appointment_idx on public.job_notes(appointment_id, created_at desc);
create index if not exists job_notes_author_idx on public.job_notes(author_id, created_at desc);

alter table public.job_notes enable row level security;
revoke all on public.job_notes from anon, authenticated;
grant all on public.job_notes to service_role;

-- Private job photo metadata (bytes live in Storage bucket job-photos).
create table if not exists public.job_attachments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  appointment_id uuid references public.job_appointments(id) on delete set null,
  uploaded_by uuid not null references public.staff_profiles(user_id) on delete restrict,
  storage_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 15728640),
  width integer,
  height integer,
  caption text check (caption is null or char_length(caption) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists job_attachments_job_idx on public.job_attachments(job_id, created_at desc);
create index if not exists job_attachments_appointment_idx on public.job_attachments(appointment_id, created_at desc);

alter table public.job_attachments enable row level security;
revoke all on public.job_attachments from anon, authenticated;
grant all on public.job_attachments to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'job-photos',
  'job-photos',
  false,
  15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No direct client policies: HQ uses service-role signed URLs after server authz.

-- Atomic timer start: prevents concurrent active sessions for one technician.
create or replace function public.tech_start_time_entry(
  p_job_id uuid,
  p_appointment_id uuid,
  p_staff_id uuid,
  p_technician_user_id uuid,
  p_started_at timestamptz,
  p_note text default null
) returns uuid
language plpgsql
as $$
declare
  v_existing uuid;
  v_id uuid;
begin
  if p_appointment_id is null then
    raise exception 'APPOINTMENT_REQUIRED';
  end if;

  select id into v_existing
  from public.job_time_entries
  where technician_user_id = p_technician_user_id
    and status in ('active', 'on_break')
  for update;

  if v_existing is not null then
    raise exception 'ACTIVE_SESSION_EXISTS:%', v_existing;
  end if;

  insert into public.job_time_entries (
    job_id, appointment_id, staff_id, technician_user_id,
    started_at, status, entry_source, note, updated_at
  ) values (
    p_job_id, p_appointment_id, p_staff_id, p_technician_user_id,
    p_started_at, 'active', 'timer', nullif(trim(coalesce(p_note, '')), ''), now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.tech_start_time_entry(uuid, uuid, uuid, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.tech_start_time_entry(uuid, uuid, uuid, uuid, timestamptz, text) to service_role;
