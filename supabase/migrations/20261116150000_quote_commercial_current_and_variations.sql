-- C1.1: commercial current version (separate from job primary) + variation parent support.
-- Additive only. Does not rewrite quote_number values.
-- Local / approved apply only — do not apply to hosted Production without explicit approval.
--
-- Schema inspection conclusion: status + parent_quote_id alone cannot uniquely identify the
-- commercial current version when an approved parent and an approved/sent variation coexist.
-- Smallest additive change: commercial_family_id + is_commercial_current (partial unique).
-- jobs.quote_id / job_quotes.is_primary remain the job "primary" pointer and may be a draft.
--
-- Commercial current semantics: is_commercial_current represents the accepted commercial
-- version only. Draft / approved / sent never become current automatically. A family may
-- have no current accepted quote. Billing reconciliation is deferred to C2 — HQ does not
-- know whether historical invoices/payments exist outside HQ, so is_commercial_current
-- alone must not drive invoicing decisions.

alter table public.quotes
  add column if not exists commercial_family_id uuid;

alter table public.quotes
  add column if not exists is_commercial_current boolean not null default false;

comment on column public.quotes.commercial_family_id is
  'Root quote id for a revision family. Job primary (jobs.quote_id / job_quotes.is_primary) is a separate concept and may point at a draft.';
comment on column public.quotes.is_commercial_current is
  'At most one accepted commercial current version per family. Never set for draft/approved/sent. Independent of job primary. Not a substitute for billing reconciliation (C2).';

-- Backfill family ids: roots = self; children inherit from parents (depth-limited).
update public.quotes q
set commercial_family_id = q.id
where q.parent_quote_id is null
  and q.commercial_family_id is null;

do $$
declare
  updated integer;
  guard integer := 0;
begin
  loop
    update public.quotes child
       set commercial_family_id = parent.commercial_family_id
      from public.quotes parent
     where child.parent_quote_id = parent.id
       and parent.commercial_family_id is not null
       and (child.commercial_family_id is distinct from parent.commercial_family_id);
    get diagnostics updated = row_count;
    guard := guard + 1;
    exit when updated = 0 or guard > 50;
  end loop;
end $$;

-- Clear any non-accepted currents (idempotent for re-apply / local harden).
update public.quotes
set is_commercial_current = false
where is_commercial_current
  and status is distinct from 'accepted';

-- Backfill: only accepted quotes may be commercial current (one per family).
-- Families with no accepted member legitimately have no current.
with ranked as (
  select
    id,
    row_number() over (
      partition by commercial_family_id
      order by accepted_at desc nulls last, created_at desc, id
    ) as rn
  from public.quotes
  where status = 'accepted'
    and commercial_family_id is not null
)
update public.quotes q
set is_commercial_current = true
from ranked r
where q.id = r.id
  and r.rn = 1
  and not q.is_commercial_current;

alter table public.quotes
  alter column commercial_family_id set not null;

alter table public.quotes
  drop constraint if exists quotes_commercial_family_id_fkey;

alter table public.quotes
  add constraint quotes_commercial_family_id_fkey
  foreign key (commercial_family_id) references public.quotes(id) on delete restrict;

create unique index if not exists quotes_one_commercial_current_per_family
  on public.quotes (commercial_family_id)
  where is_commercial_current;

create index if not exists quotes_commercial_family_idx
  on public.quotes (commercial_family_id, created_at desc);

-- Extend draft save to accept parent_quote_id / revision / family (keeps EEQ sequence).
-- New drafts (standard or variation) never start as commercial current.
create or replace function public.save_quote_draft_atomic(
  p_quote_id uuid,
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
  v_parent_id uuid;
  v_parent public.quotes%rowtype;
  v_revision integer := 0;
  v_family uuid;
  v_customer uuid;
begin
  v_customer := nullif(p_values->>'customer_id', '')::uuid;
  v_parent_id := nullif(p_values->>'parent_quote_id', '')::uuid;

  if p_quote_id is null then
    if v_parent_id is not null then
      select * into v_parent from public.quotes where id = v_parent_id for share;
      if not found then
        raise exception 'Parent quote not found';
      end if;
      if v_customer is null or v_parent.customer_id is distinct from v_customer then
        raise exception 'Variation parent must belong to the same customer';
      end if;
      v_revision := greatest(coalesce(v_parent.revision_number, 0), 0) + 1;
      v_family := coalesce(v_parent.commercial_family_id, v_parent.id);
    end if;

    -- Pre-allocate id so roots can self-reference commercial_family_id under the FK.
    v_id := gen_random_uuid();

    insert into public.quotes(
      id, customer_id, enquiry_id, site_address_id, site_address_snapshot, customer_snapshot,
      title, scope_of_work, inclusions, exclusions, customer_notes, internal_notes,
      customer_display, pricing_mode, created_by,
      parent_quote_id, revision_number, commercial_family_id, is_commercial_current
    )
    values(
      v_id,
      v_customer,
      nullif(p_values->>'enquiry_id', '')::uuid,
      nullif(p_values->>'site_address_id', '')::uuid,
      coalesce(p_values->'site_address_snapshot', '{}'::jsonb),
      coalesce(p_values->'customer_snapshot', '{}'::jsonb),
      p_values->>'title',
      p_values->>'scope_of_work',
      p_values->>'inclusions',
      p_values->>'exclusions',
      p_values->>'customer_notes',
      p_values->>'internal_notes',
      p_values->>'customer_display',
      p_values->>'pricing_mode',
      p_actor,
      v_parent_id,
      v_revision,
      coalesce(v_family, v_id),
      false
    );
  else
    select status into v_status
      from public.quotes where id = p_quote_id for update;
    if v_status is null or v_status not in ('draft', 'changes_requested') then
      raise exception 'Quote is not editable';
    end if;
    -- Parent relationship is fixed after create; ignore parent changes on update.
    update public.quotes set
      customer_id = v_customer,
      enquiry_id = nullif(p_values->>'enquiry_id', '')::uuid,
      site_address_id = nullif(p_values->>'site_address_id', '')::uuid,
      site_address_snapshot = coalesce(p_values->'site_address_snapshot', '{}'::jsonb),
      customer_snapshot = coalesce(p_values->'customer_snapshot', '{}'::jsonb),
      title = p_values->>'title',
      scope_of_work = p_values->>'scope_of_work',
      inclusions = p_values->>'inclusions',
      exclusions = p_values->>'exclusions',
      customer_notes = p_values->>'customer_notes',
      internal_notes = p_values->>'internal_notes',
      customer_display = p_values->>'customer_display',
      pricing_mode = p_values->>'pricing_mode',
      updated_at = now()
    where id = p_quote_id;
    v_id := p_quote_id;
  end if;

  delete from public.quote_items where quote_id = v_id;
  insert into public.quote_items(
    quote_id, position, description, category, quantity, unit,
    unit_price_cents, internal_unit_cost_cents, gst_applicable
  )
  select
    v_id,
    (x->>'position')::integer,
    x->>'description',
    x->>'category',
    (x->>'quantity')::numeric,
    x->>'unit',
    (x->>'unit_price_cents')::bigint,
    (x->>'internal_unit_cost_cents')::bigint,
    (x->>'gst_applicable')::boolean
  from jsonb_array_elements(p_lines) x;

  insert into public.quote_activity(quote_id, actor_id, action)
  values (
    v_id,
    p_actor,
    case when p_quote_id is null then 'draft_created' else 'draft_updated' end
  );

  return v_id;
end;
$$;

revoke all on function public.save_quote_draft_atomic(uuid, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_quote_draft_atomic(uuid, jsonb, jsonb, uuid) to service_role;

-- Internal helper: set accepted quote as commercial current (same transaction as caller).
-- Does NOT change jobs.quote_id / job_quotes.is_primary.
-- Does NOT make invoicing decisions — C2 owns billing reconciliation.
create or replace function public._make_accepted_quote_commercial_current(
  p_quote public.quotes,
  p_actor uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_other record;
  v_has_billing boolean := false;
begin
  if p_quote.status is distinct from 'accepted' then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', 'Only accepted quotes can be the current commercial version.'
    );
  end if;

  -- Billing safeguard stub: HQ cannot see invoices/payments outside HQ (C2).
  -- If local invoice tables appear, block unsafe automatic supersession.
  select to_regclass('public.invoices') is not null
      or to_regclass('public.job_invoices') is not null
      or to_regclass('public.xero_invoices') is not null
    into v_has_billing;

  if v_has_billing then
    if exists (
      select 1 from public.quotes q
      where q.commercial_family_id = p_quote.commercial_family_id
        and q.id is distinct from p_quote.id
        and q.is_commercial_current
        and q.status = 'accepted'
    ) then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'message', 'Automatic supersession is blocked because existing billing cannot be safely reconciled. Office review is required.',
        'requiresReview', true
      );
    end if;
  end if;

  update public.quotes
     set is_commercial_current = false,
         updated_at = now()
   where commercial_family_id = p_quote.commercial_family_id
     and is_commercial_current
     and id is distinct from p_quote.id;

  for v_other in
    select id, status, quote_number
    from public.quotes
    where commercial_family_id = p_quote.commercial_family_id
      and id is distinct from p_quote.id
      and status in ('approved', 'sent', 'accepted')
    for update
  loop
    update public.quotes
       set status = 'superseded',
           is_commercial_current = false,
           updated_at = now()
     where id = v_other.id;

    insert into public.quote_activity(quote_id, actor_id, action, note)
    values (
      v_other.id,
      p_actor,
      'superseded',
      'Superseded by ' || p_quote.quote_number
    );
  end loop;

  update public.quotes
     set is_commercial_current = true,
         updated_at = now()
   where id = p_quote.id;

  insert into public.quote_activity(quote_id, actor_id, action, note)
  values (p_quote.id, p_actor, 'made_commercial_current', 'Current commercial version for family');

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'quoteId', p_quote.id,
    'message', 'Quote is now the current commercial version. Job primary was not changed.'
  );
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', 'Another current-version change happened at the same time. Refresh and try again.'
    );
end;
$$;

revoke all on function public._make_accepted_quote_commercial_current(public.quotes, uuid)
  from public, anon, authenticated;
grant execute on function public._make_accepted_quote_commercial_current(public.quotes, uuid)
  to service_role;

-- Manual office designation: accepted quotes only.
create or replace function public.make_quote_commercial_current_atomic(
  p_quote_id uuid,
  p_actor uuid,
  p_require_accepted boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
begin
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Quote not found.');
  end if;

  if v_quote.status = 'superseded' or v_quote.status = 'cancelled' or v_quote.status = 'declined' then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'This quote cannot become the current commercial version.');
  end if;

  -- Commercial current = accepted commercial version only.
  if v_quote.status is distinct from 'accepted' then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', 'Only accepted quotes can be the current commercial version. Draft, approved and sent quotes are not commercial current.'
    );
  end if;

  return public._make_accepted_quote_commercial_current(v_quote, p_actor);
end;
$$;

revoke all on function public.make_quote_commercial_current_atomic(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.make_quote_commercial_current_atomic(uuid, uuid, boolean)
  to service_role;

-- Atomic acceptance: status + evidence + (for revisions) commercial current in one transaction.
create or replace function public.accept_quote_atomic(
  p_quote_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
  v_prior text;
  v_current jsonb;
  v_made_current boolean := false;
begin
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Quote not found.');
  end if;

  if v_quote.status not in ('approved', 'sent') then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', 'Cannot mark as accepted from status "' || v_quote.status || '".'
    );
  end if;

  v_prior := v_quote.status;

  update public.quotes
     set status = 'accepted',
         accepted_at = now(),
         updated_at = now()
   where id = p_quote_id
     and status = v_prior
  returning * into v_quote;

  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', 'Status update failed or quote was changed. Refresh and try again.'
    );
  end if;

  insert into public.quote_activity(quote_id, actor_id, action, note)
  values (p_quote_id, p_actor, 'accepted', 'Accepted from ' || v_prior);

  -- Revised quotations: accept + make current atomically.
  -- Standard quotes: become current on accept (accepted commercial version) in the same txn.
  v_current := public._make_accepted_quote_commercial_current(v_quote, p_actor);

  if coalesce((v_current->>'ok')::boolean, false) is not true then
    -- Roll back acceptance if commercial transition cannot complete safely.
    raise exception '%', coalesce(v_current->>'message', 'Unable to set commercial current version.');
  end if;

  v_made_current := true;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'quoteId', p_quote_id,
    'madeCommercialCurrent', v_made_current,
    'isRevision', v_quote.parent_quote_id is not null,
    'message', case
      when v_quote.parent_quote_id is not null then
        'Quote marked as accepted and set as the current commercial version. Job primary was not changed.'
      else
        'Quote marked as accepted and set as the current commercial version. Job primary was not changed.'
    end
  );
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', 'Another current-version change happened at the same time. Refresh and try again.'
    );
  when others then
    -- Re-raise after mapping review-style messages to structured failure without partial accept.
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', SQLERRM,
      'requiresReview', position('billing cannot be safely reconciled' in SQLERRM) > 0
    );
end;
$$;

revoke all on function public.accept_quote_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_quote_atomic(uuid, uuid) to service_role;

-- Harden create-and-link: association_kind=variation requires a real parent_quote_id.
-- Historical rows with variation labels but no parent are left untouched.
create or replace function public.job_quote_create_and_link_atomic(
  p_job_id uuid,
  p_actor uuid,
  p_values jsonb,
  p_association_kind text default 'quote',
  p_label text default null,
  p_make_primary boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote_id uuid;
  v_link jsonb;
  v_parent uuid;
begin
  if p_association_kind = 'variation' then
    v_parent := nullif(p_values->>'parent_quote_id', '')::uuid;
    if v_parent is null then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'message', 'Variations require a parent quote. Open the quote builder with a parent selected.'
      );
    end if;
  end if;

  v_quote_id := public.save_quote_draft_atomic(
    null,
    p_values,
    '[]'::jsonb,
    p_actor
  );

  v_link := public.job_quote_link_atomic(
    p_job_id,
    v_quote_id,
    p_actor,
    p_association_kind,
    p_label,
    p_make_primary
  );

  if coalesce((v_link->>'ok')::boolean, false) is not true then
    raise exception '%', coalesce(v_link->>'message', 'Unable to link the new quote to this job.');
  end if;

  insert into public.job_activity(job_id, actor_id, action, note)
  values (
    p_job_id,
    p_actor,
    'quote_created_and_linked',
    coalesce(nullif(pg_catalog.btrim(coalesce(p_values->>'title', '')), ''), v_quote_id::text)
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'quoteId', v_quote_id,
    'isPrimary', coalesce((v_link->>'isPrimary')::boolean, false),
    'message', 'Draft quote created and linked.'
  );
end;
$$;

revoke all on function public.job_quote_create_and_link_atomic(uuid, uuid, jsonb, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.job_quote_create_and_link_atomic(uuid, uuid, jsonb, text, text, boolean)
  to service_role;
