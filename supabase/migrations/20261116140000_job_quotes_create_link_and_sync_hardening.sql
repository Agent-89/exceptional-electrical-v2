-- Milestone C1 final hardening.
-- 1) Fix link_atomic so failed inserts cannot leave demoted primaries behind.
-- 2) Add create+link in one transaction (draft rolls back if link fails via RAISE).
-- Requires: job_quotes table, prior atomic RPCs, save_quote_draft_atomic.
-- Privileges: service_role only. HQ authorizes office staff before calling.
-- Do not apply to hosted Production without explicit approval.

create or replace function public.job_quote_link_atomic(
  p_job_id uuid,
  p_quote_id uuid,
  p_actor uuid,
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
  v_job public.jobs%rowtype;
  v_quote public.quotes%rowtype;
  v_existing integer;
  v_has_primary boolean;
  v_is_primary boolean;
  v_label text;
begin
  if p_association_kind is null
     or p_association_kind not in ('quote', 'variation', 'additional_works') then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Invalid association type.');
  end if;

  v_label := nullif(pg_catalog.btrim(coalesce(p_label, '')), '');
  if v_label is not null and pg_catalog.char_length(v_label) > 80 then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Label is too long.');
  end if;

  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Job not found.');
  end if;

  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Quote not found.');
  end if;

  if v_job.customer_id is null then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', 'Add a customer to this job before linking a quote.'
    );
  end if;

  if v_quote.customer_id is null or v_quote.customer_id is distinct from v_job.customer_id then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', 'Quotes must belong to the same customer as the job.'
    );
  end if;

  select count(*)::integer into v_existing
  from public.job_quotes
  where job_id = p_job_id and quote_id = p_quote_id;
  if v_existing > 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'That quote is already linked to this job.');
  end if;

  select exists(
    select 1 from public.job_quotes where job_id = p_job_id and is_primary
  ) into v_has_primary;

  if not v_has_primary and v_job.quote_id is not null then
    v_has_primary := true;
  end if;

  v_is_primary := p_make_primary or not v_has_primary;

  -- Insert first as non-primary, then promote. Avoids demote-without-insert on unique races.
  begin
    insert into public.job_quotes (
      job_id, quote_id, is_primary, association_kind, label, linked_by
    ) values (
      p_job_id, p_quote_id, false, p_association_kind, v_label, p_actor
    );
  exception
    when unique_violation then
      return pg_catalog.jsonb_build_object('ok', false, 'message', 'That quote is already linked to this job.');
  end;

  if v_is_primary then
    update public.job_quotes
       set is_primary = false
     where job_id = p_job_id
       and is_primary
       and quote_id is distinct from p_quote_id;

    update public.job_quotes
       set is_primary = true
     where job_id = p_job_id
       and quote_id = p_quote_id;

    update public.jobs
       set quote_id = p_quote_id,
           updated_at = now()
     where id = p_job_id;
  end if;

  insert into public.job_activity(job_id, actor_id, action, note)
  values (
    p_job_id,
    p_actor,
    'quote_linked',
    coalesce(nullif(pg_catalog.btrim(v_quote.title), ''), p_quote_id::text)
      || case when v_is_primary then ' (primary)' else '' end
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'isPrimary', v_is_primary,
    'quoteId', p_quote_id,
    'message', 'Quote linked.'
  );
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', 'Another primary quote change happened at the same time. Refresh and try again.'
    );
end;
$$;

-- Create draft quote + link in one transaction.
-- Link failures RAISE so save_quote_draft_atomic work in this call rolls back (no orphan draft).
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
begin
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

revoke all on function public.job_quote_link_atomic(uuid, uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.job_quote_create_and_link_atomic(uuid, uuid, jsonb, text, text, boolean)
  from public, anon, authenticated;

grant execute on function public.job_quote_link_atomic(uuid, uuid, uuid, text, text, boolean)
  to service_role;
grant execute on function public.job_quote_create_and_link_atomic(uuid, uuid, jsonb, text, text, boolean)
  to service_role;
