-- ============================================================================
-- HOSTED SAMPLE OPS WIPE — OWNER APPROVAL REQUIRED
-- ============================================================================
-- Target: Exceptional Electrical hosted Supabase udwdurnknweavmksotii
--         (shared Preview + Production).
-- Purpose: Clear sample/ops data for a clean Tradify import slate.
--          Owner-approved 18 Nov 2026: also clear enquiries.
--
-- NEVER auto-run. Do NOT apply as a migration. Run only after explicit owner
-- approval on the wipe chat (e.g. "wipe now" / implement wipe plan).
--
-- KEEP:
--   staff_profiles, auth.users
--   scheduling_staff
--   google_calendar_connections
--   vapi_call_intake rows (customer_id nulled)
--   storage.buckets row for job-photos
--
-- CLEAR:
--   enquiries (+ enquiry_activity),
--   timesheets, appointments, jobs (+ notes/attachments/activity/assignments),
--   quotes (+ items/activity/job_quotes), invoices (+ items/payments/activity),
--   import_row_map / import_batches,
--   customers (+ addresses/notes),
--   storage.objects in bucket job-photos
--
-- Safety: no TRUNCATE ... CASCADE across unrelated domains.
-- Requires tradify_import_apply_foundation migration for import_* tables.
-- ============================================================================

begin;

-- vapi_call_intake.customer_id is NO ACTION — must null before customer delete
update public.vapi_call_intake
   set customer_id = null
 where customer_id is not null;

-- Enquiries reference customers; clear activity then enquiries before customers.
truncate table
  public.enquiry_activity,
  public.enquiries
restart identity;

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
  public.invoice_payments,
  public.invoice_items,
  public.invoice_activity,
  public.invoices,
  public.quote_activity,
  public.quote_items,
  public.quotes,
  public.customer_notes,
  public.customer_addresses,
  public.import_row_map,
  public.import_batches
restart identity;

delete from public.customers;

-- Fresh numbering for HQ-created rows after wipe (Tradify apply uses explicit numbers).
alter sequence public.job_reference_seq restart with 1;
alter sequence public.quote_number_seq restart with 1;
alter sequence if exists public.invoice_number_seq restart with 1;
alter sequence if exists public.enquiry_reference_seq restart with 1;

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
-- Verification (expect cleared ops/enquiries = 0; staff kept > 0)
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
union all select 'invoice_payments', count(*)::int from public.invoice_payments
union all select 'invoice_items', count(*)::int from public.invoice_items
union all select 'invoices', count(*)::int from public.invoices
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
union all select 'vapi_with_customer', count(*)::int from public.vapi_call_intake where customer_id is not null
order by 1;

select sequencename, last_value
  from pg_sequences
 where schemaname = 'public'
   and sequencename in ('job_reference_seq', 'quote_number_seq', 'enquiry_reference_seq')
 order by 1;
