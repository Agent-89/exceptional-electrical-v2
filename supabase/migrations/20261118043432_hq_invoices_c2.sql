-- HQ-native invoices (C2 surface). No Xero writes.
-- Additive / forward-only. Do not apply to hosted without owner approval.

create sequence if not exists public.invoice_number_seq;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique
    default ('EEI-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'sent', 'part_paid', 'paid', 'void')),
  customer_id uuid references public.customers(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  site_address_id uuid references public.customer_addresses(id) on delete set null,
  customer_snapshot jsonb not null default '{}'::jsonb,
  site_address_snapshot jsonb not null default '{}'::jsonb,
  job_snapshot jsonb not null default '{}'::jsonb,
  title text,
  description text,
  customer_notes text,
  internal_notes text,
  terms_and_payment text,
  customer_display text not null default 'itemised'
    check (customer_display in ('itemised', 'total_only')),
  pricing_mode text not null default 'detailed'
    check (pricing_mode in ('fixed', 'detailed', 'mixed')),
  customer_reference text,
  issue_date date,
  due_date date,
  approved_by uuid references public.staff_profiles(user_id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  created_by uuid references public.staff_profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.invoices is
  'HQ tax invoices. Optional job_id / quote_id provenance; payments live in invoice_payments.';

comment on column public.invoices.customer_reference is
  'Customer PO / your-reference. Primary entry point for billing; seed from linked quote when present.';

create index if not exists invoices_customer_idx on public.invoices (customer_id);
create index if not exists invoices_job_idx on public.invoices (job_id);
create index if not exists invoices_quote_idx on public.invoices (quote_id);
create index if not exists invoices_status_updated_idx on public.invoices (status, updated_at desc);
create index if not exists invoices_updated_idx on public.invoices (updated_at desc);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  position integer not null default 0,
  description text not null,
  category text not null default 'other'
    check (category in ('labour', 'material', 'equipment', 'subcontractor', 'other')),
  quantity numeric not null default 1,
  unit text not null default 'each',
  unit_price_cents integer not null default 0,
  internal_unit_cost_cents integer,
  gst_applicable boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists invoice_items_invoice_id_idx
  on public.invoice_items (invoice_id, position);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  payment_date date not null default (timezone('Australia/Perth', now()))::date,
  reference text,
  payment_method text not null default 'bank_transfer'
    check (payment_method in ('bank_transfer', 'card', 'cash', 'cheque', 'other')),
  notes text,
  created_by uuid references public.staff_profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists invoice_payments_invoice_idx
  on public.invoice_payments (invoice_id, payment_date desc);

create table if not exists public.invoice_activity (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  event_type text not null,
  message text,
  actor_id uuid references public.staff_profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists invoice_activity_invoice_idx
  on public.invoice_activity (invoice_id, created_at desc);

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.invoice_activity enable row level security;

revoke all on public.invoices from anon, authenticated;
revoke all on public.invoice_items from anon, authenticated;
revoke all on public.invoice_payments from anon, authenticated;
revoke all on public.invoice_activity from anon, authenticated;
revoke all on sequence public.invoice_number_seq from anon, authenticated;

-- Persist draft header + replace line items atomically.
create or replace function public.save_invoice_draft_atomic(
  p_invoice_id uuid,
  p_values jsonb,
  p_lines jsonb,
  p_actor uuid
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
  v_status text;
  v_customer uuid;
  v_job uuid;
  v_quote uuid;
  v_customer_reference text;
begin
  v_customer := nullif(p_values->>'customer_id', '')::uuid;
  v_job := nullif(p_values->>'job_id', '')::uuid;
  v_quote := nullif(p_values->>'quote_id', '')::uuid;
  v_customer_reference := nullif(trim(coalesce(p_values->>'customer_reference', '')), '');

  if p_invoice_id is null then
    v_id := gen_random_uuid();
    insert into public.invoices(
      id, customer_id, job_id, quote_id, site_address_id,
      customer_snapshot, site_address_snapshot, job_snapshot,
      title, description, customer_notes, internal_notes, terms_and_payment,
      customer_display, pricing_mode, customer_reference,
      issue_date, due_date, created_by, status
    )
    values(
      v_id,
      v_customer,
      v_job,
      v_quote,
      nullif(p_values->>'site_address_id', '')::uuid,
      coalesce(p_values->'customer_snapshot', '{}'::jsonb),
      coalesce(p_values->'site_address_snapshot', '{}'::jsonb),
      coalesce(p_values->'job_snapshot', '{}'::jsonb),
      p_values->>'title',
      p_values->>'description',
      p_values->>'customer_notes',
      p_values->>'internal_notes',
      p_values->>'terms_and_payment',
      coalesce(nullif(p_values->>'customer_display', ''), 'itemised'),
      coalesce(nullif(p_values->>'pricing_mode', ''), 'detailed'),
      v_customer_reference,
      nullif(p_values->>'issue_date', '')::date,
      nullif(p_values->>'due_date', '')::date,
      p_actor,
      'draft'
    );
  else
    select status into v_status from public.invoices where id = p_invoice_id for update;
    if not found then
      raise exception 'Invoice not found';
    end if;
    if v_status not in ('draft') then
      raise exception 'Only draft invoices can be edited';
    end if;
    v_id := p_invoice_id;
    update public.invoices set
      customer_id = v_customer,
      job_id = v_job,
      quote_id = v_quote,
      site_address_id = nullif(p_values->>'site_address_id', '')::uuid,
      customer_snapshot = coalesce(p_values->'customer_snapshot', '{}'::jsonb),
      site_address_snapshot = coalesce(p_values->'site_address_snapshot', '{}'::jsonb),
      job_snapshot = coalesce(p_values->'job_snapshot', '{}'::jsonb),
      title = p_values->>'title',
      description = p_values->>'description',
      customer_notes = p_values->>'customer_notes',
      internal_notes = p_values->>'internal_notes',
      terms_and_payment = p_values->>'terms_and_payment',
      customer_display = coalesce(nullif(p_values->>'customer_display', ''), customer_display),
      pricing_mode = coalesce(nullif(p_values->>'pricing_mode', ''), pricing_mode),
      customer_reference = v_customer_reference,
      issue_date = nullif(p_values->>'issue_date', '')::date,
      due_date = nullif(p_values->>'due_date', '')::date,
      updated_at = now()
    where id = v_id;
  end if;

  delete from public.invoice_items where invoice_id = v_id;

  insert into public.invoice_items(
    invoice_id, position, description, category, quantity, unit,
    unit_price_cents, internal_unit_cost_cents, gst_applicable
  )
  select
    v_id,
    coalesce((line->>'position')::integer, ordinality::integer - 1),
    coalesce(nullif(line->>'description', ''), 'Line item'),
    coalesce(nullif(line->>'category', ''), 'other'),
    coalesce((line->>'quantity')::numeric, 1),
    coalesce(nullif(line->>'unit', ''), 'each'),
    coalesce((line->>'unit_price_cents')::integer, 0),
    nullif(line->>'internal_unit_cost_cents', '')::integer,
    coalesce((line->>'gst_applicable')::boolean, true)
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as t(line, ordinality);

  insert into public.invoice_activity(invoice_id, event_type, message, actor_id)
  values(
    v_id,
    case when p_invoice_id is null then 'created' else 'draft_saved' end,
    case when p_invoice_id is null then 'Invoice draft created' else 'Invoice draft saved' end,
    p_actor
  );

  return v_id;
end;
$$;

revoke all on function public.save_invoice_draft_atomic(uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_invoice_draft_atomic(uuid, jsonb, jsonb, uuid) to service_role;

-- Recalculate payment status after payment mutations (not void).
-- Optional p_total_inc_gst_cents lets the app pass pricing-mode-aware totals.
create or replace function public.sync_invoice_payment_status(
  p_invoice_id uuid,
  p_total_inc_gst_cents integer default null
)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_status text;
  v_mode text;
  v_paid integer;
  v_total integer;
  v_next text;
begin
  select status, pricing_mode into v_status, v_mode
  from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if v_status in ('draft', 'void') then
    return v_status;
  end if;

  select coalesce(sum(amount_cents), 0) into v_paid
  from public.invoice_payments
  where invoice_id = p_invoice_id;

  if p_total_inc_gst_cents is not null then
    v_total := greatest(p_total_inc_gst_cents, 0);
  else
    select coalesce(sum(
      round(quantity * unit_price_cents)
      + case when gst_applicable then round(quantity * unit_price_cents * 0.1) else 0 end
    ), 0)::integer into v_total
    from public.invoice_items
    where invoice_id = p_invoice_id
      and (
        (coalesce(v_mode, 'detailed') = 'fixed' and category = 'other' and description = 'Fixed-price electrical work')
        or (coalesce(v_mode, 'detailed') <> 'fixed' and not (category = 'other' and description = 'Fixed-price electrical work'))
      );
  end if;

  if v_paid <= 0 then
    v_next := case when v_status in ('part_paid', 'paid') then 'sent' else v_status end;
  elsif v_paid >= v_total and v_total > 0 then
    v_next := 'paid';
  else
    v_next := 'part_paid';
  end if;

  if v_next is distinct from v_status then
    update public.invoices
      set status = v_next, updated_at = now()
      where id = p_invoice_id;
  end if;

  return v_next;
end;
$$;

revoke all on function public.sync_invoice_payment_status(uuid, integer) from public, anon, authenticated;
grant execute on function public.sync_invoice_payment_status(uuid, integer) to service_role;
