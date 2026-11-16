-- Milestone C1: additive multi-quote associations for jobs.
-- Requires public.jobs and public.quotes (already present on hosted HQ / local baseline).
-- Does NOT recreate quotes / scheduling_staff (separate greenfield reconciliation).
-- Do not apply to hosted Production without explicit approval.

create table if not exists public.job_quotes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete restrict,
  is_primary boolean not null default false,
  association_kind text not null default 'quote'
    check (association_kind in ('quote', 'variation', 'additional_works')),
  label text
    check (label is null or (char_length(trim(label)) between 1 and 80)),
  linked_by uuid references public.staff_profiles(user_id) on delete set null,
  linked_at timestamptz not null default now(),
  unique (job_id, quote_id)
);

comment on table public.job_quotes is
  'Job ↔ quote associations. jobs.quote_id remains the denormalised primary pointer for legacy workflows.';

create unique index if not exists job_quotes_one_primary_idx
  on public.job_quotes (job_id)
  where is_primary;

create index if not exists job_quotes_quote_idx on public.job_quotes (quote_id);
create index if not exists job_quotes_job_linked_idx on public.job_quotes (job_id, linked_at desc);

alter table public.job_quotes enable row level security;
-- HQ uses service-role server actions (same pattern as jobs / job_assignments).
revoke all on public.job_quotes from anon, authenticated;

-- Preserve legacy single-quote jobs: copy jobs.quote_id into the join as primary.
insert into public.job_quotes (job_id, quote_id, is_primary, association_kind, linked_at)
select j.id, j.quote_id, true, 'quote', coalesce(j.created_at, now())
from public.jobs j
where j.quote_id is not null
on conflict (job_id, quote_id) do nothing;
