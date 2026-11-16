-- Additive: office resolution tracking for further-visit flags.
-- Keeps field_follow_up_required as the original technician/office flag.
-- Do NOT apply to Production without owner approval.
-- Preview shares Production Supabase — leave unapplied until approved.

alter table public.job_appointments
  add column if not exists field_follow_up_resolved_at timestamptz,
  add column if not exists field_follow_up_resolved_by uuid references auth.users (id),
  add column if not exists field_follow_up_resolution text,
  add column if not exists field_follow_up_linked_appointment_id uuid
    references public.job_appointments (id) on delete set null,
  add column if not exists field_follow_up_resolution_note text;

comment on column public.job_appointments.field_follow_up_resolved_at is
  'When office resolved the further-visit flag. NULL = still outstanding.';
comment on column public.job_appointments.field_follow_up_resolution is
  'office_cleared | linked_visit';
comment on column public.job_appointments.field_follow_up_linked_appointment_id is
  'Optional existing follow-up appointment linked by office. Does not create visits.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_appointments_follow_up_resolution_check'
  ) then
    alter table public.job_appointments
      add constraint job_appointments_follow_up_resolution_check
      check (
        field_follow_up_resolution is null
        or field_follow_up_resolution in ('office_cleared', 'linked_visit')
      );
  end if;
end $$;

create index if not exists job_appointments_follow_up_outstanding_idx
  on public.job_appointments (job_id, starts_at)
  where field_follow_up_required = true and field_follow_up_resolved_at is null;
