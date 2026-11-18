# Exceptional Electrical HQ — Cursor handover

Version-controlled project handover for continuing development in Cursor after the **Production commercial release** (PR #15, 16 Nov 2026).

**Do not store credentials, API keys, or secrets in this repository.**

## 0. Production baseline (current)

| Item | Value |
|------|--------|
| Repository | `Agent-89/exceptional-electrical-v2` |
| Branch of record | `main` |
| Production merge SHA | `ffd7e09f863c0690d847b8fd8de5658fd60f1bdc` |
| Validated release tip (merged) | `91b0e23f7d8346a5d4d0c62741e97ed6c68cf84f` |
| Release PR | [#15](https://github.com/Agent-89/exceptional-electrical-v2/pull/15) (merged) |
| Production smoke | 6/6 passed |
| Previous Production rollback deployment | `dpl_BSfHgU3aG7B3N541rzEs1YpN8EvG` |
| Hosted Supabase | `udwdurnknweavmksotii` (shared Preview/Production) |
| Additional DB migrations for this release | None (six commercial migrations already hosted) |

### GitHub cleanup after release

- Merged: PR #15 (release cutover), PR #12 (commercial foundations; also recorded merged with the cutover).
- Closed as superseded: PRs #13, #14, #4.
- Historical feature branches **cleaned** — only `main` remains on origin. Obsolete PR #4 tip archived as tag `archive/pr-4-conflict-soft-confirm` (`4d8e631`).

Treat `main` at the Production merge SHA as the single source of truth. Do not re-merge obsolete tips of #13/#14/#4.

## 1. System architecture

- **Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase (Auth + Postgres), Vercel.
- **Surfaces:**
  - Marketing site (`/`, `/services/*`)
  - Staff HQ (`/hq/*`) — authenticated office + technician apps
  - Client portal (`/portal`) — placeholder; not production-ready
- **Data:** Hosted Supabase project `udwdurnknweavmksotii` (Exceptional Electrical). Preview and Production share this database.
- **AuthZ model:** Server actions / route handlers use `requireHqUser`, `assertOfficeOps`, and `assertAdminOps` from `src/lib/hq-auth.ts`. Roles live in `staff_profiles` (`owner` | `admin` | `office` | `technician`). Crew scheduling uses `scheduling_staff`, not `staff_profiles.user_id`.

## 2. Main application modules

| Area | Primary paths | Production status |
|------|----------------|-------------------|
| Enquiries | `src/app/hq/enquiries` | Live (public intake needs rate-limit/bot protection before domain cutover) |
| Customers | `src/app/hq/customers` | Live |
| Quotes / commercial | `src/app/hq/quotes`, `src/lib/quote-commercial.ts`, `src/lib/job-quotes.ts` | Live (C1 + C1.1 + workspace UX) |
| Jobs | `src/app/hq/jobs` | Live — detail tabs: Overview · Notes · Visits · Time · Quotes · Invoices · Activity · More |
| Schedule | `src/app/hq/schedule` | Live (HQ electrician overlap hard-block) |
| Field app | `src/app/field` (`/field`) | Live — separate PWA from office HQ |
| Timesheets / time review | `src/app/hq/timesheets`, job detail time tab | Live |
| Google Calendar (Neil) | `src/lib/google-calendar.ts`, `src/app/api/integrations/google-calendar` | Partial — Neil-only read; see §7 |
| Auth / session | `src/app/hq/login`, `src/app/field/login`, `src/app/hq/session`, `src/lib/hq-auth.ts` | Live — surface-aware `next` redirects |

Related design notes: `docs/commercial-multi-quote-c1.md`, `docs/commercial-quote-variations-c11.md`, `docs/tradify-migration-and-google-calendar.md`, `docs/scheduling-overlap-posture.md`, `docs/vapi-receptionist-v1.md`, `docs/DEPLOYMENT.md`, `docs/RELEASE_CANDIDATE.md`.

## 3. GitHub branching and PR conventions

Repository: `Agent-89/exceptional-electrical-v2`

- **`main`** is the Production baseline and single source of truth.
- Feature branches: `feature/<topic>` or `fix/<topic>` or `docs/<topic>`.
- Open PRs as **Draft** until validation is reported.
- Prefer stacking dependent work; avoid squash/cherry-pick that drops required behaviour across stacked PRs.
- Historical merges often used squash; branch tips of superseded PRs may **not** be ancestors of `main`. Do not re-merge obsolete tips.
- Never delete branches, merge, deploy, or apply hosted migrations without explicit owner approval.
- Do not merge obsolete Draft PR #4 wholesale; tip is recoverable from tag `archive/pr-4-conflict-soft-confirm`. Reimplement any missing soft-override behaviour on current `main` if owners request it.

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
- Known-good prior Production deployment for rollback: `dpl_BSfHgU3aG7B3N541rzEs1YpN8EvG`.

## 6. Roles and authorization

| Role | Typical access |
|------|----------------|
| owner / admin | Full office ops + admin-only actions (e.g. quote approve; Google Calendar OAuth connect/disconnect); optional field portal when crew-linked |
| office | Enquiries, customers, quotes (draft), jobs, schedule, time review; optional field portal when crew-linked |
| technician | `/field` Today / jobs / visits / account; no office schedule mutations |

**Dual surface (office + field):** Office roles (`owner` / `admin` / `office`) keep `/hq` as login home. Field is a **separate app** at `/field` (own shell, login, PWA) — no Field nav in office HQ, and no HQ nav in Field. Crew-linked office users open Field via the Field home-screen app or `/field` / `/field/login` with the same cookies. Login/session use `resolvePostAuthPath` so Field never dumps office users into HQ after refresh. Legacy `/hq/tech/*` permanently redirects to `/field/*`. Visit time-stamping still requires `scheduling_staff.auth_user_id` link + `job_appointment_staff` assignment. Pure technicians remain blocked from office HQ. Do not conflate `staff_profiles.user_id` with `scheduling_staff.id`.

Crew-link check (read-only; hosted project `udwdurnknweavmksotii`) before expecting Neil/Billy field stamps:

```sql
select sp.full_name, sp.role, sp.user_id,
       ss.id as scheduling_staff_id, ss.full_name as crew_name, ss.active, ss.auth_user_id
from staff_profiles sp
left join scheduling_staff ss on ss.auth_user_id = sp.user_id
where sp.role in ('owner', 'admin', 'office')
order by sp.full_name;
```

If `auth_user_id` is null for the intended crew row, set it with **owner-approved** hosted data update (not a Git migration).

Helpers: `src/lib/hq-roles.ts` (`canAccessFieldPortal`). Prefer server-side gates; do not trust client-only checks.

### Field + HQ PWAs (separate installs, same login)

| App | Manifest | `id` / `scope` | `start_url` | Who |
|-----|----------|----------------|-------------|-----|
| Office HQ | `/hq/manifest.webmanifest` | `/hq` / `/hq/` | `/hq` | owner / admin / office |
| Exceptional Field | `/field/manifest.webmanifest` | `/field` / `/field/` | `/field` | technicians + crew-linked office |

Cookies `ee_hq_access` / `ee_hq_refresh` (`path: '/'`) are shared. Field login is `/field/login`; HQ login is `/hq/login`. Session refresh is `/hq/session?next=…` and returns to Field when `next` is under `/field`. **Reinstall** the Field home-screen app after this change (old `/hq/tech` start URL is obsolete; redirects help once). Install Field from Account or browser UI while on `/field`; install HQ from office pages.

**Offline Field MVP** (`src/lib/field-offline/`, Field SW shell cache):

- Caches Field shell assets; **never** caches office HQ pages.
- IndexedDB snapshots of Today + opened visit briefs (assigned only).
- Outbox for timer start/pause/resume/finish, notes, and visit progress text; flushes when back online.
- Photos and first login remain **online-only**.
- Not full Tradify offline parity; deeper conflict UI / offline photos / payroll export remain later roadmap items.

## 7. External integrations

| Integration | Status | Notes |
|-------------|--------|-------|
| Supabase Auth + DB | Live | Shared Preview/Production DB |
| Google Calendar | Neil-only (see below) | Read-only; no write-back |
| Xero | Not integrated | Job UI placeholder copy only |
| Vapi receptionist | Live Edge Function (not Git-tracked until HQ push work) | Hosted `receive-vapi-enquiry` on `udwdurnknweavmksotii`; source now under `supabase/functions/receive-vapi-enquiry`. Docs: `docs/vapi-receptionist-v1.md` |
| HQ Web Push | Code shipped; off until enabled | Opt-in on installed HQ PWA; `HQ_PUSH_ENABLED=0` by default. Migration `hq_push_subscriptions` — apply hosted only with owner approval. Redeploy Edge Function only with approval. |
| Tradify import | Dry-run tooling live | `npm run tradify:dry-run` against `imports/tradify/`; no live import without approval |

### Neil Google Calendar rules

- **Scope:** Only Neil’s connected Google Calendar is integrated. Other electricians have no Google Calendar sync in v1.
- **Read behaviour:** Busy events on Neil’s calendar are considered only when Neil is on the visit crew. Show/hide is presentation-only; availability checks still use active busy events. No write-back to Google.
- **Busy hard-block:** When Neil is on the visit crew and a Google busy event overlaps the appointment window, create/edit/move is hard-blocked with a conflict-style error (`src/lib/neil-calendar-conflicts.ts`). There is no owner/admin override path.
- **Independent of HQ overlaps:** HQ electrician overlap hard-blocks (`hq_overlap`) remain separate and also non-bypassable.
- **Connect/disconnect:** OAuth connect/disconnect is an admin-ops action (owner/admin).

**Never** trigger real customer SMS/email, Xero writes, Tradify writes, or business-number Vapi forward during Preview testing. Do not mutate Production data or external integrations without approval. Keep `HQ_PUSH_ENABLED=0` on Preview so shared-DB test enquiries do not wake Production devices.

## 8. Testing and verification commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

- Unit/integration tests: `src/lib/*.test.ts` via Node test runner.
- After substantive changes, re-run the four commands above on the release tip.
- Hosted schema checks: `supabase migration list --linked` and read-only `supabase db query --linked`.
- **Local HQ preview under OneDrive:** OneDrive can corrupt `.next` (missing CSS / black login). Prefer `powershell -File scripts/dev-hq.ps1`, which junctions `.next` to `%LOCALAPPDATA%\ee-hq-next` and starts a detached Next process so stdin close does not kill the server. Open `http://127.0.0.1:3000/hq/login` (office) or `http://127.0.0.1:3000/field/login` (Field). After the Field move, **reinstall** the Field PWA from `/field` (legacy `/hq/tech` redirects once).

## 9. Incident response and rollback

1. **App regression:** Redeploy previous known-good Vercel Production deployment (`dpl_BSfHgU3aG7B3N541rzEs1YpN8EvG` or newer known-good) for `main` (or revert the merge commit and redeploy after approval).
2. **Bad Preview:** Close/ignore the Preview URL; Preview must not be treated as a separate database.
3. **Bad migration (if ever applied):** Do not “down” migrations casually. Prefer a forward fix migration after owner approval; restore from Supabase backup only with explicit approval.
4. **Auth/session issues:** Verify Supabase Auth redirect allowlists and `staff_profiles` role rows.
5. **Integration spill:** Disconnect Google Calendar OAuth; keep Xero/Vapi/Tradify disabled until investigated.

## 10. Known limitations

- Historical Git migrations are incomplete vs live schema (scheduling_staff, status checks); see Tradify/calendar doc.
- Local commercial migration filenames differ from hosted versions.
- Client portal is not production-ready.
- DEPLOYMENT.md may still contain some stale placeholder language; trust code + this handover for HQ auth state.
- Enquiry intake has honeypot + DB-backed email/phone cooldown (`src/lib/enquiry-abuse.ts`, `POST /api/enquiries`). Durable IP/edge rate limiting (e.g. Upstash) is still recommended before high-traffic marketing domain cutover.
- Race-safe DB exclusion constraints for electrician overlaps are deferred; app-layer hard-blocks remain the posture — see `docs/scheduling-overlap-posture.md`.
- Quotes can be marked sent but do not email customers yet.
- Job detail **Invoices** tab lists HQ-native invoices linked to the job (`JobInvoicesPanel`). Xero reconciliation remains deferred. **More** holds stubs for Purchase orders, Bills, and Forms. Costs is not a top-level tab yet — it should graduate when materials tracking lands.
- HQ invoices (`/hq/invoices`) mirror quotes: register, builder, preview, PDF (`EEI-######`), optional `job_id` / `quote_id`, and payment lines for part-paid / amount due. `customer_reference` is first-class on invoice create and seeds from the linked commercial-current quote when present. Xero mapping remains a later step.
- Quote/invoice letterhead (ABN, electrical licence, phone, address, bank defaults) reads from `src/lib/business-profile.ts`.
- Job header status is a colored-dot chevron dropdown (statuses in `src/lib/job-statuses.ts`). The three-dot menu is reserved for future job actions.
- Hosted: `20261118043432_hq_invoices_c2` applied (owner-approved) — invoice tables/RPCs live on shared Preview/Production project `udwdurnknweavmksotii`.
- Pending hosted migration (do **not** apply until owner approves): `20261117092844_jobs_status_to_invoice_tafe` adds `to_invoice` and `tafe` to `jobs_status_check`. Until applied, selecting those statuses in the UI will fail at the database.
- Inventory, purchasing, reports, and payroll export are not built. Field offline MVP (shell + outbox) is shipped; full offline/photos/payroll remain open.

## 11. Remaining development roadmap (post-Production)

Prioritised against fully replacing Tradify.

### P0 — Safe day-to-day ops + cutover readiness

1. **Tradify staged import dry-run** — **in progress / tooling shipped**: `npm run tradify:dry-run` (optional `--local-db`). In-memory stage + JSON/MD report; **no live write** without approval. Do not treat ~873 Tradify “In Progress” jobs as active without owner review.
2. **Enquiry abuse controls** — honeypot + email/phone cooldown shipped; edge/IP rate limit still open before heavy marketing cutover.
3. **Production ops hardening** — scheduling race posture recorded (defer DB locks). Still open: confirm Neil Google Calendar live path; optional soft-confirm double-book override later (reimplement on current `main`, do not merge #4).
4. Keep Production baseline stable; no hosted commercial migration reapply.

### P1 — Money and customer communications (close the Tradify gap)

5. **C2 billing** — HQ invoice surface is in progress on `feature/hq-invoices-c2` (manual invoices + payments + PDF; no Xero yet). Remaining: apply hosted migration after approval, then Xero reconciliation against commercial-current quotes.
6. **Outbound email/SMS** — quote send, appointment reminders (gated; never from Preview against real customers).
7. **Job materials / costing** (even before full inventory).
8. **Vapi ops hardening** — Edge Function `receive-vapi-enquiry` is already live and creates `source: 'vapi'` enquiries; keep Git + secrets aligned, harden signature/ops as needed; no business-number forward until approved.

### P2 — Full field-service parity

9. Inventory, purchasing/POs, price catalogues.
10. Client portal authentication and ownership boundaries.
11. Reports/analytics, payments UI, certificates/compliance workflows, recurring/maintenance jobs.
12. Field offline beyond MVP (photos, richer conflict UI) / payroll export.
13. Greenfield migration reconciliation so `supabase db reset` matches hosted.

### Active milestone (owner-approved lean scope)

See `docs/RELEASE_CANDIDATE.md` § “Next milestone — owner-approved / in progress”. Summary:

**Tradify import dry-run readiness + lean ops hardening** — CSV dry-run tooling/reports, enquiry cooldown + honeypot, scheduling overlap posture memo — **out of scope:** Xero, live Tradify import, Vapi cutover, portal, inventory, soft-confirm override, hosted migrations.

## 12. Release history notes (Nov 2026)

- Production commercial cutover: PR #15 → `main` at `ffd7e09` (validated tip `91b0e23`).
- Included: C1 multi-job quote associations, C1.1 variations/commercial-current, quote workspace UX, HQ electrician overlap hard-blocks, Preview defect fixes, initial Cursor handover docs.
- Superseded stacked Drafts #13/#14 and obsolete #4 closed; historical branches cleaned from origin; PR #4 tip archived as `archive/pr-4-conflict-soft-confirm`.
- No new hosted migrations required for the cutover.
