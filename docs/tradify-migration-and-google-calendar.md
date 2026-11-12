# Exceptional Electrical — Tradify migration and calendar integration

## Verified against connected Supabase (12 Nov 2026)
Existing tables: customers, customer_addresses, jobs, job_assignments, job_appointments, job_appointment_staff, staff_profiles, job_activity.
Existing jobs fields include job_number, tradify_id, tradify_reference, source, imported_at, customer_id, site_address_id.
Customer addresses have no Tradify source key. Staff profiles are keyed to auth.users and must NOT be used to create fictitious login accounts.

## Source exports
- Jobs: 1,712 rows; columns Job Number, Customer, Site, Status, Job Address, Staff, Schedule, Notes, etc.
- Customers: 629 rows, with Tradify Id and physical/postal addresses.
- Sites: 958 rows; Customer + Site Name + Address, no explicit site ID.
- Timesheets: 37 rows, useful as staff-name evidence, NOT a complete staff directory.

## Migration contract (no live import until approved)
1. Stage all CSV rows with source filename, row number, raw payload, checksum and import batch ID.
2. Customer natural key: Tradify Id. Do not merge solely by name. Maintain a mapping of source IDs to HQ UUIDs.
3. Sites: identify by (resolved customer ID, normalized site name, normalized address); flag duplicates/ambiguous matches for manual review. Preserve site name and original source row.
4. Jobs: retain original Job Number; use an explicit Tradify import mapping. Do not overwrite HQ-created jobs on number collisions. Preserve raw Tradify status, with a separate reviewed HQ operational status.
5. Schedule strings: parse into staff/date/start/end candidate rows. Group entries representing the same visit, review duplicates, cancelled and external appointments; do not auto-publish historical appointments.
6. Staff: use an independent staff directory or import identities with nullable auth user ID, verified identity mapping and display colour. Never create login accounts from timesheet names.
7. Before applying any rows: report counts, unmatched customers/sites/staff, collisions, missing dates, duplicate source keys, and expected inserts/updates. Require approval for the final import.
8. Import must be idempotent and reversible by batch; preserve existing customer, job, appointment and activity records.

## Google Calendar — Neil only
- OAuth connection initiated by an authorised owner, minimal read-only Calendar scope.
- Store tokens encrypted/server-side, never in browser-visible fields; support disconnect and revoke.
- Read the selected Google Calendar's events, normalize all-day events and timezone boundaries, retain source event IDs and cancellation state.
- Show/hide toggle affects presentation only; Neil's availability check always considers active external busy events.
- Never mark other electricians or the whole business unavailable.
- Free/transparent events must not block; private events should reveal no unnecessary details to other staff.
- Overlaps with Neil's HQ visits raise a conflict warning; authorised manager may override with an auditable reason.
- Sync with bounded refresh, pagination, retry, and a stale-data indicator. No write-back to Google in v1.

## Implementation order
1. Source-mapping/staging and dry-run validation.
2. Sites and staff directory schema plus controlled RLS.
3. Jobs workspace integration and reviewed operational statuses.
4. Google OAuth and event ingestion; Neil-only conflict integration.
5. Pilot import and reconciliation; owner approval before full cutover.

Do not treat 873 Tradify In Progress jobs as currently active without owner review.
