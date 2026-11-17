-- Source mirror for convert_enquiry_customer_atomic (review-details signature).
-- Deploy via supabase/migrations; do not apply hosted DDL without owner approval.
-- All changes in this function execute in one PostgreSQL transaction.

alter table public.customers
  add column if not exists company_name text;

drop function if exists public.convert_enquiry_customer_atomic(uuid, uuid);

create or replace function public.convert_enquiry_customer_atomic(
  p_enquiry_id uuid,
  p_actor uuid,
  p_name text default null,
  p_email text default null,
  p_phone text default null,
  p_company_name text default null,
  p_allow_duplicate boolean default false,
  p_link_customer_id uuid default null,
  p_address_label text default null,
  p_address_line1 text default null,
  p_address_line2 text default null,
  p_suburb text default null,
  p_state text default null,
  p_postcode text default null,
  p_address_notes text default null,
  p_customer_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  e public.enquiries%rowtype;
  v_id uuid;
  v_matches integer;
  v_created boolean := false;
  v_linked_existing boolean := false;
  v_name text;
  v_email text;
  v_phone_raw text;
  v_phone text;
  v_company text;
  v_note text;
  v_has_address boolean;
  v_label text;
  v_line1 text;
  v_line2 text;
  v_suburb text;
  v_state text;
  v_postcode text;
  v_address_notes text;
  v_addr_count integer;
  v_match_ids uuid[];
  v_existing public.customers%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(727412);
  select * into e from public.enquiries where id = p_enquiry_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Enquiry not found');
  end if;
  if e.customer_id is not null then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'customerId', e.customer_id,
      'message', 'Already linked to a customer'
    );
  end if;

  v_name := pg_catalog.btrim(coalesce(nullif(p_name, ''), e.name, ''));
  v_email := pg_catalog.lower(pg_catalog.btrim(coalesce(
    nullif(p_email, ''),
    nullif(e.email, ''),
    ''
  )));
  v_phone_raw := pg_catalog.btrim(coalesce(nullif(p_phone, ''), nullif(e.phone, ''), ''));
  v_company := nullif(pg_catalog.btrim(coalesce(p_company_name, '')), '');
  v_note := nullif(pg_catalog.btrim(coalesce(p_customer_note, '')), '');

  if pg_catalog.char_length(v_name) < 2 or pg_catalog.char_length(v_name) > 150 then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Enter a valid full name');
  end if;
  if v_company is not null and pg_catalog.char_length(v_company) > 150 then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Company name is too long');
  end if;
  if pg_catalog.char_length(v_email) > 254 then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Invalid email address');
  end if;
  if pg_catalog.char_length(v_phone_raw) > 40 then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Phone number is too long');
  end if;
  if v_email = '' and v_phone_raw = '' then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Enter a name and at least one contact method');
  end if;
  if v_note is not null and (pg_catalog.char_length(v_note) < 2 or pg_catalog.char_length(v_note) > 3000) then
    return pg_catalog.jsonb_build_object('ok', false, 'message', 'Enter a note between 2 and 3000 characters');
  end if;

  v_phone := pg_catalog.regexp_replace(v_phone_raw, '[^0-9]', '', 'g');
  if pg_catalog.length(v_phone) = 11 and pg_catalog.left(v_phone, 2) = '61' then
    v_phone := '0' || pg_catalog.substr(v_phone, 3);
  end if;

  v_label := nullif(pg_catalog.btrim(coalesce(p_address_label, '')), '');
  v_line1 := nullif(pg_catalog.btrim(coalesce(p_address_line1, '')), '');
  v_line2 := nullif(pg_catalog.btrim(coalesce(p_address_line2, '')), '');
  v_suburb := nullif(pg_catalog.btrim(coalesce(p_suburb, '')), '');
  v_state := nullif(pg_catalog.btrim(coalesce(p_state, '')), '');
  v_postcode := nullif(pg_catalog.btrim(coalesce(p_postcode, '')), '');
  v_address_notes := nullif(pg_catalog.btrim(coalesce(p_address_notes, '')), '');
  v_has_address := v_label is not null
    or v_line1 is not null
    or v_line2 is not null
    or v_suburb is not null
    or (v_state is not null and v_state <> 'WA')
    or v_postcode is not null
    or v_address_notes is not null;

  if v_has_address then
    if v_line1 is null or v_suburb is null or v_postcode is null or v_postcode !~ '^[0-9]{4}$' then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'message', 'Enter a valid street address, suburb and four-digit postcode'
      );
    end if;
    if v_state is null then v_state := 'WA'; end if;
    if v_label is null then v_label := 'Service address'; end if;
    if pg_catalog.char_length(v_label) > 160
      or pg_catalog.char_length(v_line1) > 160
      or pg_catalog.char_length(coalesce(v_line2, '')) > 160
      or pg_catalog.char_length(v_suburb) > 160
      or pg_catalog.char_length(v_state) > 160
      or pg_catalog.char_length(coalesce(v_address_notes, '')) > 1000 then
      return pg_catalog.jsonb_build_object('ok', false, 'message', 'Address fields are too long');
    end if;
  end if;

  if p_link_customer_id is not null then
    select * into v_existing from public.customers where id = p_link_customer_id;
    if not found then
      return pg_catalog.jsonb_build_object('ok', false, 'message', 'Selected customer not found');
    end if;
    v_id := p_link_customer_id;
    v_linked_existing := true;
    update public.customers set
      name = case when pg_catalog.btrim(coalesce(name, '')) = '' then v_name else name end,
      email = case when nullif(pg_catalog.btrim(coalesce(email, '')), '') is null and v_email <> '' then v_email else email end,
      phone = case when nullif(pg_catalog.btrim(coalesce(phone, '')), '') is null and v_phone_raw <> '' then v_phone_raw else phone end,
      company_name = case when nullif(pg_catalog.btrim(coalesce(company_name, '')), '') is null then v_company else company_name end,
      updated_at = now()
    where id = v_id;
  else
    select count(*)::integer,
           pg_catalog.array_agg(c.id order by c.id)
      into v_matches, v_match_ids
      from public.customers c
     where (v_email <> '' and pg_catalog.lower(pg_catalog.btrim(coalesce(c.email, ''))) = v_email)
        or (pg_catalog.length(v_phone) >= 8 and
          (case
             when pg_catalog.length(pg_catalog.regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g')) = 11
              and pg_catalog.left(pg_catalog.regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), 2) = '61'
             then '0' || pg_catalog.substr(pg_catalog.regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), 3)
             else pg_catalog.regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g')
           end) = v_phone);

    if v_matches > 0 and not coalesce(p_allow_duplicate, false) then
      return pg_catalog.jsonb_build_object(
        'ok', false,
        'conflict', case when v_matches = 1 then 'single' else 'multiple' end,
        'matchIds', to_jsonb(v_match_ids),
        'message', case
          when v_matches = 1 then 'A customer with this email or phone already exists. Link the existing profile, or confirm creating a separate customer.'
          else 'Multiple matching customers found. Review them before linking or creating another record.'
        end
      );
    end if;

    insert into public.customers(name, email, phone, company_name)
    values (
      v_name,
      nullif(v_email, ''),
      nullif(v_phone_raw, ''),
      v_company
    )
    returning id into v_id;
    v_created := true;
  end if;

  if v_has_address then
    select count(*)::integer into v_addr_count
      from public.customer_addresses
     where customer_id = v_id;
    insert into public.customer_addresses(
      customer_id, label, address_line1, address_line2, suburb, state, postcode, notes, is_primary
    ) values (
      v_id,
      v_label,
      v_line1,
      v_line2,
      v_suburb,
      v_state,
      v_postcode,
      v_address_notes,
      coalesce(v_addr_count, 0) = 0
    );
  end if;

  if v_note is not null then
    insert into public.customer_notes(customer_id, actor_id, note)
    values (v_id, p_actor, v_note);
  end if;

  update public.enquiries
     set customer_id = v_id, updated_at = now()
   where id = p_enquiry_id;

  insert into public.enquiry_activity(enquiry_id, actor_id, action, note)
  values (
    p_enquiry_id,
    p_actor,
    'customer_linked',
    case
      when v_created then 'Customer profile created'
      when v_linked_existing then 'Linked to existing customer'
      else 'Linked to existing customer'
    end
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'customerId', v_id,
    'message', case
      when v_created then 'Customer created and linked'
      else 'Existing customer linked'
    end
  );
end;
$$;

revoke all on function public.convert_enquiry_customer_atomic(
  uuid, uuid, text, text, text, text, boolean, uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.convert_enquiry_customer_atomic(
  uuid, uuid, text, text, text, text, boolean, uuid, text, text, text, text, text, text, text, text
) to service_role;
