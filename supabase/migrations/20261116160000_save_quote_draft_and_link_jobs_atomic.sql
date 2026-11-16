-- C1.1 polish: save draft + link one or more jobs in a single transaction.
-- Duplicate associations are treated as successful (idempotent retries).
-- Any other link failure RAISE so the draft save rolls back with the links.
-- Additive only — does not alter 20261116150000.
-- Privileges: service_role only. Do not apply to hosted without approval.

create or replace function public.save_quote_draft_and_link_jobs_atomic(
  p_quote_id uuid,
  p_values jsonb,
  p_lines jsonb,
  p_actor uuid,
  p_job_ids uuid[] default '{}'::uuid[],
  p_association_kind text default 'quote'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote_id uuid;
  v_job_id uuid;
  v_seen uuid[] := '{}'::uuid[];
  v_linked uuid[] := '{}'::uuid[];
  v_duplicates integer := 0;
  v_link jsonb;
  v_kind text;
  v_label text;
begin
  v_kind := coalesce(nullif(pg_catalog.btrim(coalesce(p_association_kind, '')), ''), 'quote');
  if v_kind not in ('quote', 'variation', 'additional_works') then
    raise exception 'Invalid association type.';
  end if;

  if v_kind = 'variation' and p_quote_id is null then
    if nullif(p_values->>'parent_quote_id', '') is null then
      raise exception 'Select the quote this variation revises.';
    end if;
  end if;

  v_quote_id := public.save_quote_draft_atomic(
    p_quote_id,
    p_values,
    coalesce(p_lines, '[]'::jsonb),
    p_actor
  );

  v_label := case when v_kind = 'variation' then 'Variation' else null end;

  if p_job_ids is not null then
    foreach v_job_id in array p_job_ids loop
      if v_job_id is null then
        continue;
      end if;
      if v_job_id = any (v_seen) then
        continue;
      end if;
      v_seen := v_seen || v_job_id;

      v_link := public.job_quote_link_atomic(
        v_job_id,
        v_quote_id,
        p_actor,
        v_kind,
        v_label,
        false
      );

      if coalesce((v_link->>'ok')::boolean, false) is true then
        v_linked := v_linked || v_job_id;
      elsif position('already linked' in lower(coalesce(v_link->>'message', ''))) > 0 then
        -- Idempotent retry: association already exists.
        v_duplicates := v_duplicates + 1;
        v_linked := v_linked || v_job_id;
      else
        -- Abort the whole transaction (draft + prior links in this call).
        raise exception '%',
          coalesce(v_link->>'message', 'Unable to link the quote to one or more jobs.');
      end if;
    end loop;
  end if;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'quoteId', v_quote_id,
    'linkedJobIds', to_jsonb(v_linked),
    'duplicateCount', v_duplicates,
    'message', case
      when coalesce(array_length(v_seen, 1), 0) = 0 then 'Draft saved'
      when coalesce(array_length(v_seen, 1), 0) = 1 then 'Draft saved and linked to job.'
      else 'Draft saved and linked to jobs.'
    end
  );
end;
$$;

revoke all on function public.save_quote_draft_and_link_jobs_atomic(uuid, jsonb, jsonb, uuid, uuid[], text)
  from public, anon, authenticated;
grant execute on function public.save_quote_draft_and_link_jobs_atomic(uuid, jsonb, jsonb, uuid, uuid[], text)
  to service_role;
