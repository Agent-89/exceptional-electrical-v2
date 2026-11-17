-- Optional per-quote customer PO / your-reference for commercial documents.
-- Additive — does not alter prior commercial migrations.
-- Updates save_quote_draft_atomic to persist customer_reference.
-- Do not apply to hosted without owner approval.

alter table public.quotes
  add column if not exists customer_reference text;

comment on column public.quotes.customer_reference is
  'Optional customer PO / your-reference for this quote. Invoice create (C2) is the primary entry point when billing lands; seed from quote when present.';

-- Keep save_quote_draft_atomic aligned with quotes.customer_reference.
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
  v_existing_parent uuid;
  v_existing_customer uuid;
  v_parent public.quotes%rowtype;
  v_revision integer := 0;
  v_family uuid;
  v_customer uuid;
  v_customer_reference text;
begin
  v_customer := nullif(p_values->>'customer_id', '')::uuid;
  v_parent_id := nullif(p_values->>'parent_quote_id', '')::uuid;
  v_customer_reference := nullif(trim(coalesce(p_values->>'customer_reference', '')), '');

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

    v_id := gen_random_uuid();
    perform public._lock_quote_commercial_family(coalesce(v_family, v_id));

    insert into public.quotes(
      id, customer_id, enquiry_id, site_address_id, site_address_snapshot, customer_snapshot,
      title, scope_of_work, inclusions, exclusions, customer_notes, internal_notes,
      customer_display, pricing_mode, customer_reference, created_by,
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
      v_customer_reference,
      p_actor,
      v_parent_id,
      v_revision,
      coalesce(v_family, v_id),
      false
    );
  else
    select status, parent_quote_id, customer_id
      into v_status, v_existing_parent, v_existing_customer
      from public.quotes where id = p_quote_id for update;
    if v_status is null or v_status not in ('draft', 'changes_requested') then
      raise exception 'Quote is not editable';
    end if;

    if v_existing_customer is distinct from v_customer
       and public.quote_has_job_associations(p_quote_id) then
      raise exception '%', public.quote_customer_change_blocked_message();
    end if;

    -- Parent/family immutable; customer must stay compatible with parent when variation.
    if v_existing_parent is not null then
      select * into v_parent from public.quotes where id = v_existing_parent for share;
      if not found then
        raise exception 'Parent quote not found';
      end if;
      if v_customer is null or v_parent.customer_id is distinct from v_customer then
        raise exception 'Variation parent must belong to the same customer';
      end if;
    end if;

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
      customer_reference = v_customer_reference,
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
