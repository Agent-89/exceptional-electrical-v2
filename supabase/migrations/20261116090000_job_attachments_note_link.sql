-- Additive: allow job photos to optionally attach to a job note.
-- Safe for existing rows (NULL). Do NOT apply to Production without owner approval.
-- Preview shares Production Supabase — leave this unapplied until approved.

alter table public.job_attachments
  add column if not exists job_note_id uuid
  references public.job_notes(id) on delete set null;

comment on column public.job_attachments.job_note_id is
  'Optional parent note for a note+photo update. NULL = standalone photo.';

create index if not exists job_attachments_note_created_idx
  on public.job_attachments (job_note_id, created_at desc)
  where job_note_id is not null;
