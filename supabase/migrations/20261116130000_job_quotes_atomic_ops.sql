-- Milestone C1 follow-up: atomic job ↔ quote association mutations.
-- Keeps jobs.quote_id and job_quotes.is_primary consistent in one transaction.
-- Requires public.job_quotes (20261116120000_job_quotes_associations.sql).
-- Privileges: service_role only. HQ authorizes office staff in server actions before calling.
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

  -- Also treat legacy jobs.quote_id as an existing primary when join row is missing.
  if not v_has_primary and v_job.quote_id is not null then
    v_has_primary := true;
  end if;

  v_is_primary := p_make_primary or not v_has_primary;

  if v_is_primary then
    update public.job_quotes
       set is_primary = false
     where job_id = p_job_id
       and is_primary
       and quote_id is distinct from p_quote_id;
  end if;

  begin
    insert into public.job_quotes (
      job_id, quote_id, is_primary, association_kind, label, linked_by
    ) values (
      p_job_id, p_quote_id, v_is_primary, p_association_kind, v_label, p_actor
    );
  exception
    when unique_violation then
      return pg_catalog.jsonb_build_object('ok', false, 'message', 'That quote is already linked to this job.');
  end;

  if v_is_primary then
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

create or replace function public.job_quote_unlink_atomic(
  p_job_id uuid,
  p_quote_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
  v_assoc public.job_quotes%rowtype;
  v_was_primary boolean := false;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Job not found.');
  end if;

  select * into v_assoc
  from public.job_quotes
  where job_id = p_job_id and quote_id = p_quote_id
  for update;

  if found then
    v_was_primary := v_assoc.is_primary or v_job.quote_id is not distinct from p_quote_id;
    delete from public.job_quotes where id = v_assoc.id;
  elsif v_job.quote_id is not distinct from p_quote_id then
    v_was_primary := true;
  else
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'That quote is not linked to this job.');
  end if;

  if v_was_primary then
    update public.jobs
       set quote_id = null,
           updated_at = now()
     where id = p_job_id;
  end if;

  insert into public.job_activity(job_id, actor_id, action, note)
  values (p_job_id, p_actor, 'quote_unlinked', p_quote_id::text);

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'clearedPrimary', v_was_primary,
    'message', case
      when v_was_primary then
        'Quote unlinked. The quote record was kept. This job has no primary quote until you select one.'
      else
        'Quote unlinked. The quote record was kept.'
    end
  );
end;
$$;

create or replace function public.job_quote_set_primary_atomic(
  p_job_id uuid,
  p_quote_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
  v_assoc public.job_quotes%rowtype;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Job not found.');
  end if;

  select * into v_assoc
  from public.job_quotes
  where job_id = p_job_id and quote_id = p_quote_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', 'Link the quote to this job before making it primary.'
    );
  end if;

  update public.job_quotes
     set is_primary = false
   where job_id = p_job_id
     and quote_id is distinct from p_quote_id
     and is_primary;

  update public.job_quotes
     set is_primary = true
   where job_id = p_job_id
     and quote_id = p_quote_id;

  update public.jobs
     set quote_id = p_quote_id,
         updated_at = now()
   where id = p_job_id;

  insert into public.job_activity(job_id, actor_id, action, note)
  values (p_job_id, p_actor, 'quote_primary_set', p_quote_id::text);

  return pg_catalog.jsonb_build_object('ok', true, 'message', 'Primary quote updated.');
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', 'Another primary quote change happened at the same time. Refresh and try again.'
    );
end;
$$;

create or replace function public.job_quote_sync_primary_after_create_atomic(
  p_job_id uuid,
  p_quote_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Job not found.');
  end if;

  -- Ensure the create-job-from-quote pointer and join row stay aligned.
  update public.job_quotes
     set is_primary = false
   where job_id = p_job_id
     and quote_id is distinct from p_quote_id
     and is_primary;

  insert into public.job_quotes (
    job_id, quote_id, is_primary, association_kind, linked_by
  ) values (
    p_job_id, p_quote_id, true, 'quote', p_actor
  )
  on conflict (job_id, quote_id) do update
    set is_primary = true,
        linked_by = coalesce(public.job_quotes.linked_by, excluded.linked_by);

  update public.jobs
     set quote_id = p_quote_id,
         updated_at = now()
   where id = p_job_id
     and quote_id is distinct from p_quote_id;

  return pg_catalog.jsonb_build_object('ok', true, 'message', 'Primary quote association synced.');
exception
  when unique_violation then
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'message', 'Another primary quote change happened at the same time. Refresh and try again.'
    );
end;
$$;

revoke all on function public.job_quote_link_atomic(uuid, uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.job_quote_unlink_atomic(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.job_quote_set_primary_atomic(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.job_quote_sync_primary_after_create_atomic(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.job_quote_link_atomic(uuid, uuid, uuid, text, text, boolean)
  to service_role;
grant execute on function public.job_quote_unlink_atomic(uuid, uuid, uuid)
  to service_role;
grant execute on function public.job_quote_set_primary_atomic(uuid, uuid, uuid)
  to service_role;
grant execute on function public.job_quote_sync_primary_after_create_atomic(uuid, uuid, uuid)
  to service_role;
