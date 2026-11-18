-- Tradify import apply foundation (additive / forward-only).
-- Owner approval required before applying to hosted udwdurnknweavmksotii.
-- Supports idempotent CSV import with batch rollback mapping.
-- Does NOT create Auth users or staff_profiles.

-- ---------------------------------------------------------------------------
-- Import batch bookkeeping
-- ---------------------------------------------------------------------------
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null unique,
  source_system text not null default 'tradify'
    check (source_system in ('tradify')),
  environment text,
  applied_at timestamptz not null default now(),
  row_counts jsonb not null default '{}'::jsonb,
  checksum jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.import_batches is
  'One row per successful Tradify (or future) import apply. Used for audit and batch rollback.';

create table if not exists public.import_row_map (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null references public.import_batches(batch_id) on delete cascade,
  entity text not null
    check (entity in (
      'customer',
      'address',
      'job',
      'appointment',
      'quote',
      'invoice',
      'invoice_payment',
      'time_entry',
      'scheduling_staff'
    )),
  source_key text not null,
  hq_id uuid not null,
  created_at timestamptz not null default now(),
  unique (entity, source_key)
);

create index if not exists import_row_map_batch_idx
  on public.import_row_map (batch_id, entity);

comment on table public.import_row_map is
  'Idempotent source-key → HQ UUID map. Unique per entity+source_key across batches.';

alter table public.import_batches enable row level security;
alter table public.import_row_map enable row level security;
revoke all on public.import_batches from anon, authenticated;
revoke all on public.import_row_map from anon, authenticated;
grant all on public.import_batches to service_role;
grant all on public.import_row_map to service_role;

-- ---------------------------------------------------------------------------
-- Source keys on operational tables
-- ---------------------------------------------------------------------------
alter table public.customers
  add column if not exists tradify_id text;

create unique index if not exists customers_tradify_id_uidx
  on public.customers (tradify_id)
  where tradify_id is not null;

comment on column public.customers.tradify_id is
  'Tradify customer Id natural key. Nullable for HQ-native customers.';

alter table public.jobs
  add column if not exists tradify_status text;

comment on column public.jobs.tradify_status is
  'Raw Tradify job Status string preserved at import for owner review.';

alter table public.quotes
  add column if not exists tradify_quote_no text;

create unique index if not exists quotes_tradify_quote_no_uidx
  on public.quotes (tradify_quote_no)
  where tradify_quote_no is not null;

comment on column public.quotes.tradify_quote_no is
  'Tradify Quote No (e.g. QT00002). HQ quote_number may mirror or use EEQ- form.';

alter table public.invoices
  add column if not exists tradify_invoice_number text;

create unique index if not exists invoices_tradify_invoice_number_uidx
  on public.invoices (tradify_invoice_number)
  where tradify_invoice_number is not null;

comment on column public.invoices.tradify_invoice_number is
  'Tradify Invoice Number (e.g. INV-0039).';

-- ---------------------------------------------------------------------------
-- Crew-only time entries (no Auth required for imported / office-entered rows)
-- ---------------------------------------------------------------------------
-- Existing schema required technician_user_id NOT NULL → staff_profiles.
-- Electricians may exist only as scheduling_staff until logins are linked.

alter table public.job_time_entries
  alter column technician_user_id drop not null;

alter table public.job_time_entries
  drop constraint if exists job_time_entries_entry_source_check;

alter table public.job_time_entries
  add constraint job_time_entries_entry_source_check
  check (entry_source in ('timer', 'manual', 'import'));

-- Live timers still require an Auth-linked technician; imported/manual may be crew-only.
alter table public.job_time_entries
  drop constraint if exists job_time_entries_technician_required_for_live;

alter table public.job_time_entries
  add constraint job_time_entries_technician_required_for_live
  check (
    (status in ('active', 'on_break') and technician_user_id is not null)
    or (status not in ('active', 'on_break'))
  );

comment on column public.job_time_entries.technician_user_id is
  'Auth staff_profiles.user_id when known. Nullable for import/manual crew-only rows linked via staff_id.';
