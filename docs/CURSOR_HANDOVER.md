# Exceptional Electrical HQ — Cursor handover

Version-controlled project handover for continuing development in Cursor after the commercial Production baseline release.

**Do not store credentials, API keys, or secrets in this repository.**

## 1. System architecture

- **Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase (Auth + Postgres), Vercel.
- **Surfaces:**
  - Marketing site (`/`, `/services/*`)
  - Staff HQ (`/hq/*`) — authenticated office + technician apps
  - Client portal (`/portal`) — placeholder; not production-ready
- **Data:** Hosted Supabase project `udwdurnknweavmksotii` (Exceptional Electrical). Preview and Production share this database.
- **AuthZ model:** Server actions / route handlers use `requireHqUser`, `assertOfficeOps`, and `assertAdminOps` from `src/lib/hq-auth.ts`. Roles live in `staff_profiles` (`owner` | `admin` | `office` | `technician`). Crew scheduling uses `scheduling_staff`, not `staff_profiles.user_id`.

## 2. Main application modules

| Area | Primary paths |
|------|----------------|
| Enquiries | `src/app/hq/enquiries` |
| Customers | `src/app/hq/customers` |
| Quotes / commercial | `src/app/hq/quotes`, `src/lib/quote-commercial.ts`, `src/lib/job-quotes.ts` |
| Jobs | `src/app/hq/jobs` |
| Schedule | `src/app/hq/schedule` |
| Technician field | `src/app/hq/tech` |
| Timesheets / time review | `src/app/hq/timesheets`, job detail time tab |
| Google Calendar (Neil) | `src/lib/google-calendar.ts`, `src/app/api/integrations/google-calendar` |
| Auth / session | `src/app/hq/login`, `src/app/hq/session`, `src/lib/hq-auth.ts` |

Related design notes: `docs/commercial-multi-quote-c1.md`, `docs/commercial-quote-variations-c11.md`, `docs/tradify-migration-and-google-calendar.md`, `docs/vapi-receptionist-v1.md`, `docs/DEPLOYMENT.md`.

## 3. GitHub branching and PR conventions

Repository: `Agent-89/exceptional-electrical-v2`

- **`main`** is the Production baseline and single source of truth after release.
- Feature branches: `feature/<topic>` or `fix/<topic>`.
- Open PRs as **Draft** until validation is reported.
- Prefer stacking dependent work (example release stack):
  1. PR #12 commercial foundations → `main`
  2. PR #13 variations → `main` (retarget after #12)
  3. PR #14 quote workspace UX → `main` (retarget after #13)
- Historical merges used squash; branch tips of merged PRs are often **not** ancestors of `main`. Do not re-merge obsolete tips.
- Never delete branches, merge, deploy, or apply hosted migrations without explicit owner approval.
- Do not merge obsolete Draft PR #4 (`feature/release-b-conflict-warnings-20261111`); reimplement any missing behaviour on current `main`/RC instead.

## 4. Supabase development and migrations

### Conventions

- Create new SQL with `supabase migration new <name>` only.
- Migrations are **forward-only**. Never rewrite an already-applied hosted migration.
- Local filenames often differ from hosted `schema_migrations.version` timestamps. Match by **semantic name**, not filename.
- Commercial migrations already hosted (do **not** reapply):

  | Hosted version | Name |
  |----------------|------|
  | `20261116073207` | job_quotes_associations |
  | `20261116073210` | job_quotes_atomic_ops |
  | `20261116073213` | job_quotes_create_link_and_sync_hardening |
  | `20261116092044` | quote_commercial_current_and_variations |
  | `20261116104051` | save_quote_draft_and_link_jobs_atomic |
  | `20261116104105` | quote_customer_change_requires_unlink |

### Safe reconciliation procedure

1. `supabase migration list --linked` and compare local vs remote by name.
2. Read-only verify objects with `supabase db query --linked` (tables, RLS, functions, grants, triggers).
3. If local history drifts, document a **repair map** in docs; optionally add empty/no-op marker migrations for greenfield clones only after approval.
4. Apply new additive migrations to hosted only with explicit approval. Preview shares Production data.

### Local vs hosted

- Default local: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `ALLOW_HOSTED_SUPABASE=0`.
- Hosted URL is blocked in development unless `ALLOW_HOSTED_SUPABASE=1` (see `src/lib/hq-auth.ts`).

## 5. Vercel Preview and Production

- Connect the GitHub repo to the Vercel project for this app.
- **Preview** deploys from PR branches; **Production** from `main` after approval.
- Preview and Production currently share hosted Supabase — use **fictional records only** on Preview.
- Env expectations (names only; values in Vercel / private local env):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SECRET_KEY` (server only; never `NEXT_PUBLIC_`)
  - Optional: `NEXT_PUBLIC_HQ_ORIGIN`, `NEXT_PUBLIC_SITE_URL`
  - Google Calendar (when enabled): `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`
- Password-reset allowlists: see `docs/DEPLOYMENT.md` and `src/lib/hq-password-reset.ts`.

## 6. Roles and authorization

| Role | Typical access |
|------|----------------|
| owner / admin | Full office ops + admin-only (quote approve, Google Calendar connect) |
| office | Enquiries, customers, quotes (draft), jobs, schedule, time review |
| technician | `/hq/tech` Today / jobs / visits / account; no office schedule mutations |

Helpers: `src/lib/hq-roles.ts`. Prefer server-side gates; do not trust client-only checks.

## 7. External integrations

| Integration | Status | Notes |
|-------------|--------|-------|
| Supabase Auth + DB | Live | Shared Preview/Production DB |
| Google Calendar | Neil-only read | Conflict override auditable; no write-back |
| Xero | Not integrated | Job UI placeholder copy only |
| Vapi receptionist | Draft / disconnected | `docs/vapi-receptionist-v1.md` |
| Tradify import | Dry-run / planning | `docs/tradify-migration-and-google-calendar.md`; no live import without approval |

**Never** trigger real customer SMS/email, Xero writes, Tradify writes, or live Vapi cutover during Preview testing.

## 8. Testing and verification commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

- Unit/integration tests: `src/lib/*.test.ts` via Node test runner.
- After substantive changes, re-run the four commands above on the release-candidate tip.
- Hosted schema checks: `supabase migration list --linked` and read-only `supabase db query --linked`.

## 9. Incident response and rollback

1. **App regression:** Redeploy previous known-good Vercel Production deployment for `main` (or revert the merge commit and redeploy).
2. **Bad Preview:** Close/ignore the Preview URL; Preview must not be treated as a separate database.
3. **Bad migration (if ever applied):** Do not “down” migrations casually. Prefer a forward fix migration after owner approval; restore from Supabase backup only with explicit approval.
4. **Auth/session issues:** Verify Supabase Auth redirect allowlists and `staff_profiles` role rows.
5. **Integration spill:** Disconnect Google Calendar OAuth; keep Xero/Vapi/Tradify disabled until investigated.

## 10. Known limitations

- Historical Git migrations are incomplete vs live schema (scheduling_staff, status checks); see Tradify/calendar doc.
- Local commercial migration filenames differ from hosted versions.
- Client portal is not production-ready.
- DEPLOYMENT.md still contains some stale placeholder language; trust code + this handover for HQ auth state.
- Enquiry marketing launch still needs rate limiting / bot protection before public domain cutover.
- Race-safe DB exclusion constraints for electrician overlaps are not yet present; app-layer hard-blocks cover create + schedule edit paths.

## 11. Remaining development roadmap (suggested)

1. Production merge of commercial stack (#12 → #13 → #14) after Preview smoke approval.
2. Optional DB-level overlap exclusion / advisory locks for scheduling races.
3. Soft-confirm override UX (if owners want intentional double-book with audit), without merging obsolete PR #4.
4. Tradify staged import dry-run → approved cutover.
5. Xero invoice integration.
6. Vapi webhook + signature verification behind staging.
7. Client portal authentication and ownership boundaries.
8. Greenfield migration reconciliation so `supabase db reset` matches hosted.

## 12. Release candidate notes (Nov 2026)

- Integrated tip branch: `feature/hq-quote-workspace-ux`
- Stack: #12 + #13 + #14
- Scheduling hard-block for HQ electrician overlaps applied on visit editor + timeline persistence paths to match appointment creation (see release decision report).
