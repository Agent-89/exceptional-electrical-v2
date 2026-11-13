-- Deploy to a staging Supabase project before enabling the application RPC.
-- All changes in this function execute in one PostgreSQL transaction.
create or replace function public.convert_enquiry_customer_atomic(p_enquiry_id uuid, p_actor uuid)
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
  v_phone text;
  v_email text;
begin
  -- Serialise conversions and hold the enquiry row lock until completion.
  perform pg_catalog.pg_advisory_xact_lock(727412);
  select * into e from public.enquiries where id = p_enquiry_id for update;
  if not found then return pg_catalog.jsonb_build_object('ok',false,'message','Enquiry not found'); end if;
  if e.customer_id is not null then
    return pg_catalog.jsonb_build_object('ok',true,'customerId',e.customer_id,'message','Already linked to a customer');
  end if;
  v_email := pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(e.email,'')));
  v_phone := pg_catalog.regexp_replace(pg_catalog.coalesce(e.phone,''),'[^0-9]','','g');
  if pg_catalog.length(v_phone)=11 and pg_catalog.left(v_phone,2)='61' then
    v_phone := '0'||pg_catalog.substr(v_phone,3);
  end if;
  select count(*),min(id) into v_matches,v_id from public.customers c
  where (v_email<>'' and pg_catalog.lower(pg_catalog.btrim(pg_catalog.coalesce(c.email,'')))=v_email)
     or (pg_catalog.length(v_phone)>=8 and
       (case when pg_catalog.length(pg_catalog.regexp_replace(pg_catalog.coalesce(c.phone,''),'[^0-9]','','g'))=11
                 and pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.coalesce(c.phone,''),'[^0-9]','','g'),2)='61'
          then '0'||pg_catalog.substr(pg_catalog.regexp_replace(pg_catalog.coalesce(c.phone,''),'[^0-9]','','g'),3)
          else pg_catalog.regexp_replace(pg_catalog.coalesce(c.phone,''),'[^0-9]','','g')
        end)=v_phone);
  if v_matches>1 then
    return pg_catalog.jsonb_build_object('ok',false,'message','Multiple matching customers found. Review them before linking.');
  end if;
  if v_matches=0 then
    insert into public.customers(name,email,phone)
    values(e.name,pg_catalog.nullif(e.email,''),pg_catalog.nullif(e.phone,''))
    returning id into v_id;
    v_created := true;
  end if;
  update public.enquiries set customer_id=v_id,updated_at=now() where id=p_enquiry_id;
  insert into public.enquiry_activity(enquiry_id,actor_id,action,note)
  values(p_enquiry_id,p_actor,'customer_linked',
    case when v_created then 'Customer profile created' else 'Linked to existing customer' end);
  return pg_catalog.jsonb_build_object('ok',true,'customerId',v_id,
    'message',case when v_created then 'Customer created and linked' else 'Existing customer linked' end);
end;
$$;
revoke all on function public.convert_enquiry_customer_atomic(uuid,uuid) from public,anon,authenticated;
grant execute on function public.convert_enquiry_customer_atomic(uuid,uuid) to service_role;
