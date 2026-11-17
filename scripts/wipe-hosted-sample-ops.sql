-- ============================================================================
-- HOSTED SAMPLE OPS WIPE — OWNER APPROVAL REQUIRED
-- ============================================================================
-- Target: Exceptional Electrical hosted Supabase udwdurnknweavmksotii
--         (shared Preview + Production).
-- Purpose: Clear fictional operational data for a clean E2E / Tradify-ready
--          slate. Keep enquiries, HQ logins, and scheduling crew.
--
-- NEVER auto-run. Do NOT apply as a migration. Run only after explicit owner
-- approval on the wipe chat (e.g. "wipe now" / implement wipe plan).
--
-- KEEP:
--   enquiries, enquiry_activity
--   staff_profiles, auth.users
--   scheduling_staff
--   google_calendar_connections
--   vapi_call_intake (null customer_id only; do not delete rows)
--   enquiry_reference_seq
--   storage.buckets row for job-photos
--
-- CLEAR:
--   timesheets, appointments, jobs (+ notes/attachments/activity/assignments),
--   quotes (+ items/activity/job_quotes), customers (+ addresses/notes),
--   storage.objects in bucket job-photos
--
-- Safety: no TRUNCATE ... CASCADE (would wipe enquiries via customers FK).
-- ============================================================================

begin;

-- vapi_call_intake.customer_id is NO ACTION — must null before customer delete
update public.vapi_call_intake
   set customer_id = null
 where customer_id is not null;

-- Multi-table truncate (self-FKs OK when listed together). No CASCADE.
truncate table
  public.job_time_entries,
  public.job_appointment_tech_reports,
  public.job_attachments,
  public.job_notes,
  public.job_appointment_staff,
  public.job_appointments,
  public.job_assignments,
  public.job_activity,
  public.job_quotes,
  public.jobs,
  public.quote_activity,
  public.quote_items,
  public.quotes,
  public.customer_notes,
  public.customer_addresses
restart identity;

-- customers cannot be truncated (enquiries + vapi still reference it)
-- DELETE sets enquiries.customer_id → NULL (ON DELETE SET NULL)
delete from public.customers;

-- Fresh demo numbering for HQ-created jobs/quotes (keep enquiry seq)
alter sequence public.job_reference_seq restart with 1;
alter sequence public.quote_number_seq restart with 1;

commit;

-- ---------------------------------------------------------------------------
-- Storage cleanup (REQUIRED — separate from SQL above)
-- Direct DELETE on storage.objects is blocked by storage.protect_delete().
-- After the transaction commits, list then remove via Storage API, e.g.:
--
--   supabase db query --linked -o json \
--     "select name from storage.objects where bucket_id = 'job-photos';"
--
--   supabase storage rm --linked --experimental --yes \
--     ss:///job-photos/<object-name> ...
--
-- Or recursively: supabase storage rm --linked --experimental --yes -r ss:///job-photos/
-- Keep the job-photos bucket; only clear objects.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Verification (expect cleared = 0; kept > 0; linkage nulls = 0)
-- ---------------------------------------------------------------------------
select 'job_time_entries' t, count(*)::int c from public.job_time_entries
union all select 'job_appointment_tech_reports', count(*)::int from public.job_appointment_tech_reports
union all select 'job_attachments', count(*)::int from public.job_attachments
union all select 'job_notes', count(*)::int from public.job_notes
union all select 'job_appointment_staff', count(*)::int from public.job_appointment_staff
union all select 'job_appointments', count(*)::int from public.job_appointments
union all select 'job_assignments', count(*)::int from public.job_assignments
union all select 'job_activity', count(*)::int from public.job_activity
union all select 'job_quotes', count(*)::int from public.job_quotes
union all select 'jobs', count(*)::int from public.jobs
union all select 'quote_activity', count(*)::int from public.quote_activity
union all select 'quote_items', count(*)::int from public.quote_items
union all select 'quotes', count(*)::int from public.quotes
union all select 'customer_notes', count(*)::int from public.customer_notes
union all select 'customer_addresses', count(*)::int from public.customer_addresses
union all select 'customers', count(*)::int from public.customers
union all select 'storage.job-photos', count(*)::int from storage.objects where bucket_id = 'job-photos'
union all select 'enquiries', count(*)::int from public.enquiries
union all select 'enquiry_activity', count(*)::int from public.enquiry_activity
union all select 'staff_profiles', count(*)::int from public.staff_profiles
union all select 'scheduling_staff', count(*)::int from public.scheduling_staff
union all select 'auth.users', count(*)::int from auth.users
union all select 'google_calendar_connections', count(*)::int from public.google_calendar_connections
union all select 'vapi_call_intake', count(*)::int from public.vapi_call_intake
union all select 'enquiries_with_customer', count(*)::int from public.enquiries where customer_id is not null
union all select 'vapi_with_customer', count(*)::int from public.vapi_call_intake where customer_id is not null
order by 1;

select sequencename, last_value
  from pg_sequences
 where schemaname = 'public'
   and sequencename in ('job_reference_seq', 'quote_number_seq', 'enquiry_reference_seq')
 order by 1;
