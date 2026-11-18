# Exceptional Electrical — Tradify migration and calendar integration

## Verified production schema notes (14 Nov 2026)

Live database relationships used by HQ jobs/scheduling (do **not** assume historical Git migrations are complete):

- `jobs.status` CHECK allows: `unassigned`, `assigned`, `scheduled`, `in_progress`, `on_hold`, `completed`, `cancelled`. There is **no** `archived` status.
- `job_assignments.staff_id` → `scheduling_staff.id`
- `job_appointment_staff.staff_id` → `scheduling_staff.id`
- `scheduling_staff.auth_user_id` is nullable → `auth.users.id` (electricians may exist without an HQ login)
- `staff_profiles.user_id` remains the HQ login / RBAC identity; it is **not** the crew id used on jobs or visits

Committed historical migrations that **no longer match** live production and must not be rewritten blindly:

- `supabase/migrations/202611100001_jobs_foundation.sql` — status CHECK omits `assigned`
- `supabase/migrations/202611100002_job_assignments_appointments.sql` — `job_assignments.staff_id` incorrectly references `staff_profiles(user_id)`
- `scheduling_staff` and `job_appointment_staff` are used in production but are **not** defined in committed migrations

A forward-only reconciliation migration (for staging/greenfield only) is planned separately; do not apply schema changes to production as part of app cleanups.

## Earlier inventory (12 Nov 2026)
Existing tables: customers, customer_addresses, jobs, job_assignments, job_appointments, job_appointment_staff, staff_profiles, scheduling_staff, job_activity.
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
6. Staff: import into `scheduling_staff` (nullable `auth_user_id`). Map visit/job crew to `scheduling_staff.id` only. Never create Auth/`staff_profiles` login accounts from timesheet names.
7. Before applying any rows: report counts, unmatched customers/sites/staff, collisions, missing dates, duplicate source keys, and expected inserts/updates. Require approval for the final import.
8. Import must be idempotent and reversible by batch; preserve existing customer, job, appointment and activity records.

## Google Calendar — Neil only
- OAuth connection initiated by an authorised owner, minimal read-only Calendar scope.
- Store tokens encrypted/server-side, never in browser-visible fields; support disconnect and revoke.
- Read the selected Google Calendar's events, normalize all-day events and timezone boundaries, retain source event IDs and cancellation state.
- Show/hide toggle affects presentation only; Neil's availability check always considers active external busy events.
- Never mark other electricians or the whole business unavailable.
- Free/transparent events must not block; private events should reveal no unnecessary details to other staff.
- Overlaps with Neil's HQ visits hard-block scheduling when Neil is on the visit crew; there is no override path.
- Sync with bounded refresh, pagination, retry, and a stale-data indicator. No write-back to Google in v1.

## Dry-run + apply tooling

```bash
npm run tradify:dry-run
npm run tradify:dry-run -- --batch imports/tradify/2026-11-18
npm run tradify:dry-run -- --local-db   # read-only local Supabase only
# Hosted apply — owner gated; migration must be applied first:
npm run tradify:apply -- --batch imports/tradify/2026-11-18 --dry-run-only
npm run tradify:apply -- --batch imports/tradify/2026-11-18 --i-understand-hosted-write
```

- Pure helpers: `src/lib/tradify-import/`
- CLIs: `scripts/tradify-dry-run.ts`, `scripts/tradify-apply.ts`
- Additive migration: `supabase/migrations/20261118064235_tradify_import_apply_foundation.sql` (hosted apply only with owner approval)
- Current cutover candidate batch: `imports/tradify/2026-11-18/` (customers, sites, jobs, quotes, invoices, one-week timesheets)
- Older rehearsal batch: `imports/tradify/2026-11-12/`
- Report / apply-summary outputs are gitignored local artefacts
- Dry-run never writes DB; `--local-db` refuses hosted URLs
- Apply creates missing `scheduling_staff` by name with `auth_user_id` null — **never** creates Auth / `staff_profiles`
- In Progress mapping: future Schedule window → `in_progress`; else → `on_hold` (review). Raw Tradify status kept on `jobs.tradify_status`
- Schedule: past + future windows → `job_appointments` + `job_appointment_staff` (overlaps reported, not hard-blocked on import)
- Multi-electrician Tradify lines with the **same job + start + end** collapse to **one** HQ visit with multiple crew (see `groupScheduleWindowsByVisit`). Repair existing duplicates: `npm run tradify:merge-visits -- --batch-id tradify-2026-11-18 --i-understand-hosted-write`
- Wipe / rollback helpers: `scripts/wipe-hosted-sample-ops.sql`, `scripts/tradify-rollback-batch.sql` (owner phrases only)

Scheduling overlap enforcement posture (app-layer vs deferred DB locks): `docs/scheduling-overlap-posture.md`.

## Implementation order
1. ~~Source-mapping/staging and dry-run validation.~~
2. ~~Apply path + import batch map + crew-only timesheets.~~ (code on `feature/tradify-import-apply`; hosted write owner-gated)
3. Sites and staff directory schema plus controlled RLS (crew rows created on apply as needed).
4. Jobs workspace integration and reviewed operational statuses (`on_hold` review queue for stale In Progress).
5. Google OAuth and event ingestion; Neil-only conflict integration.
6. Owner-approved wipe → migration → apply → Preview reconciliation; then day-to-day HQ use.

Do not treat Tradify In Progress jobs as currently active without owner review — import lands many as `on_hold` when no future visit remains.
