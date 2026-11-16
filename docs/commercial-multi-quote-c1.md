# Milestone C1 — Commercial foundations & multi-quote linking

Branch: `feature/hq-commercial-multi-quote-c1` (from `origin/main` @ `4a93815`).

## Schema reconciliation report (Phase A)

### Working tree / branch

- Feature branch created from latest `origin/main`.
- Unrelated local untracked paths (`imports/`, `scripts/tradify-dry-run/`) are not part of this milestone.

### Quotes / jobs relationships (code + baseline)

| Area | Finding |
| --- | --- |
| `public.quotes` | Full commercial quote model in Nov 14 baseline: status lifecycle, revisions (`parent_quote_id` / `revision_number`), snapshots, GST, etc. |
| `public.quote_items` | Line items with labour/material/… categories; totals computed in app (no stored total column). |
| `public.quote_activity` | Audit log for draft/approve/send lifecycle. |
| `public.jobs.quote_id` | Single nullable FK → `quotes(id)` ON DELETE SET NULL. Used by create-job-from-quote and Quotes tab. |
| Create-job-from-quote | `/hq/jobs/new?quote=` prefills customer/title/scope/address; `createJob` stores `jobs.quote_id` only. |
| Quotes tab (pre-C1) | Read-only single linked quote via `jobs.quote_id`; no link/unlink/create. |
| Auth pattern | HQ uses `dbAdmin()` (service role) + `requireOfficeUser` / `assertOfficeOps`. Jobs tables revoke `anon`/`authenticated`; authorization is server-side. Quotes keep RLS for authenticated, but HQ still goes through service role. |

### Committed migrations vs `supabase/baselines/prod_schema_20261114.sql`

**Present in baseline, missing from committed migrations (known greenfield gap):**

- `quotes`, `quote_items`, `quote_activity`, `quote_number_seq`, `save_quote_draft_atomic`
- `scheduling_staff`, `job_appointment_staff`
- Related quote RLS policies and grants

**Committed migrations that diverge from baseline/live notes (do not rewrite):**

- `202611100001_jobs_foundation.sql` — status CHECK omits `assigned` (baseline/live includes it)
- `202611100002_job_assignments_appointments.sql` — `job_assignments.staff_id` → `staff_profiles` (live uses `scheduling_staff`)

**Committed after baseline (forward-only, expected on Production only after approved apply):**

- Technician field ops, tech reports, attachment note link, follow-up resolution

**Not in baseline or migrations:** `job_quotes` (this milestone).

### Hosted Production caveat

- Linked CLI project ref in repo temp files: `udwdurnknweavmksotii` (Exceptional Electrical).
- Supabase MCP in this session is authenticated to a different org/project (`crucible-2`) and **cannot** inspect EE Production.
- Treat Nov 14 baseline as a snapshot, not live truth. Confirm hosted objects with an approved read-only check before applying any migration.

### Legacy single-quote preservation

- Keep `jobs.quote_id` as the designated primary quote pointer for create-job-from-quote and older screens.
- Backfill `job_quotes` from existing `jobs.quote_id` rows (`is_primary = true`).
- App merge layer still shows `jobs.quote_id` if the join table is absent or a row was missed (soft fallback / no double-count by `quote_id`).

## Proposed architecture (Phase B)

### Choice: additive `job_quotes` join + keep `jobs.quote_id`

```text
jobs.quote_id  →  primary quote (legacy / denormalised pointer)
job_quotes     →  all associations (primary + additional + variations)
```

Columns (minimal):

- `job_id`, `quote_id` (unique pair — prevents duplicate links)
- `is_primary` (partial unique: one primary per job)
- `association_kind` ∈ `quote` | `variation` | `additional_works`
- optional `label` (e.g. “Variation — switchboard upgrade”)
- `linked_by`, `linked_at`

### Trade-offs

| Approach | Pros | Cons |
| --- | --- | --- |
| **A. Join for non-primary only** | No sync needed for primary | Two read paths forever; easy to forget one |
| **B. Join for all + sync `jobs.quote_id` (chosen)** | One list for UI; legacy pointer kept; dedupe easy | Writers must update both primary flag and `jobs.quote_id` |
| **C. Drop `jobs.quote_id`** | Clean model | Breaks create-job-from-quote and any external readers |

### Behaviour rules

1. Link: office-only; reject cross-customer when both job and quote have customers; unique `(job_id, quote_id)`.
2. First link (or explicit “make primary”) sets `is_primary` and `jobs.quote_id`.
3. Unlink: deletes association only — never deletes the quote; if primary removed, clear `jobs.quote_id` (office can set another primary).
4. Create-job-from-quote: still sets `jobs.quote_id`; also inserts primary `job_quotes` row when the table exists.
5. No invoice/costing in this milestone.

### Release safety

- Migration is additive + backfill only. **Do not apply to hosted Supabase without explicit approval.**
- Do not rewrite historical migrations; quotes/scheduling_staff greenfield reconciliation remains a separate forward-only effort.

## Approval steps required before hosted apply / Production

Stop here until an owner explicitly approves each step:

1. **Review this PR** on GitHub (app + migration SQL only; no Production deploy yet).
2. **Read-only hosted check** on project `udwdurnknweavmksotii`: confirm `public.quotes` / `public.jobs.quote_id` exist and `public.job_quotes` does not.
3. **Approve migration apply** to hosted Supabase (staging first if available; otherwise Production with a maintenance window).
4. Apply **only** `supabase/migrations/20261116120000_job_quotes_associations.sql` (forward-only). Do not rewrite historical migrations.
5. Smoke-test Quotes tab on a **fictional** job: legacy primary display, link/unlink, create variation, create-job-from-quote.
6. Approve **Production app deploy** (Vercel) after migration is confirmed.
7. Do **not** merge/deploy invoices, Xero writes, Tradify writes, email, or Google Calendar changes as part of C1.

Local verification already performed: TypeScript, ESLint, unit tests (148), Production `next build`. Local DB received the migration for developer testing only.
