# Production baseline — commercial HQ release

## Status: RELEASED

Production commercial cutover completed via PR #15 (16 Nov 2026).

| Item | Value |
|------|--------|
| Repository | `Agent-89/exceptional-electrical-v2` |
| Branch | `main` |
| Production merge SHA | `ffd7e09f863c0690d847b8fd8de5658fd60f1bdc` |
| Validated release tip | `91b0e23f7d8346a5d4d0c62741e97ed6c68cf84f` |
| Smoke tests | 6/6 passed |
| Hosted Supabase | `udwdurnknweavmksotii` (shared Preview/Production) |
| Migrations for this release | None new — six commercial migrations already hosted |
| Rollback deployment | `dpl_BSfHgU3aG7B3N541rzEs1YpN8EvG` |

### What shipped

- C1 multi-job quote associations
- C1.1 quote variations / commercial-current workflows
- Quote workspace UX
- HQ electrician overlap hard-blocks (appointment create + schedule edit paths)
- Preview defect fixes and Cursor handover documentation

### GitHub post-release state

- Merged: #15 (release), #12 (commercial foundations)
- Closed superseded: #13, #14, #4
- Historical branches cleaned — origin keeps `main` only; PR #4 tip archived as `archive/pr-4-conflict-soft-confirm`

Do **not** reapply the six hosted commercial migrations. Do **not** treat superseded PR tips as merge candidates.

---

## Historical candidate procedure (completed)

The following was the pre-merge plan and remains for audit only:

1. ~~Merge PR #12 into `main`~~ → superseded by single-cutover PR #15 (and #12 recorded merged).
2. ~~Retarget/merge #13 then #14~~ → closed as superseded; content landed via #15.
3. Deploy Production from resulting `main` SHA after smoke tests — **done**.

### Smoke-test checklist (fictional data) — used for release

**Owner-confirmed Production smoke categories (6/6 passed)** — these six categories were the Production release gate and are the only smoke results treated as owner-confirmed:

- [x] Login as owner/admin, office, technician — correct homes and nav
- [x] Create enquiry → convert to customer
- [x] Create job; schedule multi-electrician appointment (overlap hard-block verified)
- [x] Timeline reschedule with/without crew conflict
- [x] Visit editor reschedule + crew change with/without overlap
- [x] Technician timer start/break/finish; visit report; timesheet visibility

**Extended detailed checks (not independently confirmed in the Production smoke gate)** — useful for regression follow-ups; do not treat as part of the confirmed 6/6:

- [ ] Office time correction + approve/reject
- [ ] Quote create, variation, multi-job link, unlink, customer-change guard
- [ ] Quote PDF + preview
- [ ] Notes, photos, attachments on job
- [ ] Light/dark if supported; desktop + mobile nav
- [ ] Dual surface: office user with crew link opens Field PWA (`/field`) → assigned visit stamp; session refresh stays on Field; unassigned denied; unlinked → account setup; pure technician still blocked from `/hq`; no Field item in office HQ nav
- [ ] Separate PWAs: install Field from `/field` (opens Today) and HQ from `/hq` (opens Operations); shared login; Field Account install guidance; reinstall Field after `/hq/tech` → `/field` move
- [ ] Field offline MVP: banner when offline; timer/notes/progress queue and sync; photos blocked offline; office pages not cached
- [ ] Legacy `/hq/tech` redirects to `/field`

Some extended items may have been exercised earlier on Preview or prior releases, but they were **not** re-confirmed as independent Production smoke categories for PR #15.

### Rollback

- Application: redeploy `dpl_BSfHgU3aG7B3N541rzEs1YpN8EvG` (or newer known-good) or revert merge on `main` after approval.
- Database: no migration rollback expected for this release. Forward-fix only if a later approved migration fails.

### Preview rules (still in force)

1. Confirm Vercel env vars (names in `docs/CURSOR_HANDOVER.md`; no secrets in Git).
2. Use **fictional** customers, jobs, quotes only.
3. Avoid: Xero, Tradify writes, Vapi live calls, real customer communications, Google Calendar write-back.

---

## Next milestone — owner-approved / in progress

**Name:** Tradify import dry-run readiness + lean Production ops hardening  
**Owner approval:** 18 Nov 2026 (lean scope — soft-confirm override deferred)

### Goal

Keep the Production commercial baseline stable while making HQ ready to **rehearse** Tradify cutover and harden public/ops edges — without live accounting, telephony, or data mutation of Production customer records.

### In scope (lean)

1. Tradify import **in-memory staging + dry-run report** from frozen exports (customers/sites/jobs): counts, unmatched keys, collisions, staff mapping to `scheduling_staff`, expected inserts — **read-only / local or isolated**; **no DB writes**.
2. Import batch contract remains aligned with `docs/tradify-migration-and-google-calendar.md` (idempotent, reversible-by-batch design for a future apply path).
3. Enquiry **abuse controls** on `POST /api/enquiries`: keep honeypot; add DB-backed email/phone cooldown (no new vendor). Durable IP/edge rate limiting (e.g. Upstash) remains a follow-up before high-traffic marketing domain cutover.
4. Scheduling race posture **written recommendation**: stay app-layer hard-block; defer DB exclusion/advisory locks — see `docs/scheduling-overlap-posture.md`.
5. Doc/README hygiene so handover remains authoritative.

### Explicitly deferred from the original proposal

- Soft-confirm double-book override UX (do **not** merge obsolete PR #4; reimplement later only if owners request).
- DB-level overlap exclusion / advisory-lock migration.
- Upstash / Vercel edge rate-limit vendor wiring.

### Out of scope (until separately approved)

- Reapplying the six commercial migrations
- Xero invoice writes
- Live Vapi cutover or Telstra number forward
- Client portal auth
- Inventory / purchasing / reports
- Mutating Production data without explicit owner phrases (`wipe now` / `apply migration` / `apply now`)

### Tradify apply (branch `feature/tradify-import-apply`)

Apply tooling + migration are implemented on this branch. Hosted writes remain **owner-gated**.

```bash
npm run tradify:dry-run -- --batch imports/tradify/2026-11-18
npm run tradify:apply -- --batch imports/tradify/2026-11-18 --dry-run-only
# after migration applied + owner approval:
npm run tradify:apply -- --batch imports/tradify/2026-11-18 --i-understand-hosted-write
```

Candidate batch `imports/tradify/2026-11-18`: customers, sites, jobs, quotes, invoices, one-week timesheets. Crew links use `scheduling_staff` only (no Auth creation). In Progress → `in_progress` only with a future Schedule window; otherwise `on_hold`.

### How to run the dry-run

```bash
npm run tradify:dry-run
# optional read-only local Supabase compare (127.0.0.1:54321 only):
npm run tradify:dry-run -- --local-db
```

Writes `imports/tradify/<batch>/dry-run-report.json` and `.md` (gitignored). Pure helpers live under `src/lib/tradify-import/`.

### GitHub branch state (post-cleanup)

- Origin keeps **`main` only**. Historical feature branches removed after owner approval.
- Obsolete PR #4 soft-confirm tip archived as tag `archive/pr-4-conflict-soft-confirm` (`4d8e631`) — do not merge wholesale; reimplement on `main` if soft-override is required.

### Acceptance criteria

- Dry-run produces a repeatable report artifact (JSON/Markdown) with insert/skip/collision/unmatched counts and In Progress callout.
- No Production row writes occur during dry-run validation; hosted Supabase URLs are refused for `--local-db`.
- Enquiry intake cooldown + honeypot are implemented; fictional duplicate email/phone returns 429.
- Owner has a written recommendation on DB-level overlap enforcement (`docs/scheduling-overlap-posture.md`).
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass on the milestone tip.
- Handover docs still list Production baseline SHA `ffd7e09…` unless a later approved release updates it.

### Testing requirements

- Unit tests for import mapping/normalisation pure functions and enquiry cooldown helpers.
- Dry-run against frozen `imports/tradify/` CSVs (local-only; do not commit secrets or live credentials).
- Preview smoke: login roles, enquiry submit under cooldown, schedule overlap hard-block still holds.
- No Xero/Tradify/Vapi live calls; no hosted migration apply unless separately approved.
