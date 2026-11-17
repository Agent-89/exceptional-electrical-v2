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

Some extended items may have been exercised earlier on Preview or prior releases, but they were **not** re-confirmed as independent Production smoke categories for PR #15.

### Rollback

- Application: redeploy `dpl_BSfHgU3aG7B3N541rzEs1YpN8EvG` (or newer known-good) or revert merge on `main` after approval.
- Database: no migration rollback expected for this release. Forward-fix only if a later approved migration fails.

### Preview rules (still in force)

1. Confirm Vercel env vars (names in `docs/CURSOR_HANDOVER.md`; no secrets in Git).
2. Use **fictional** customers, jobs, quotes only.
3. Avoid: Xero, Tradify writes, Vapi live calls, real customer communications, Google Calendar write-back.

---

## Next milestone proposal (awaiting approval)

**Name:** Tradify import dry-run readiness + Production ops hardening

### Goal

Keep the Production commercial baseline stable while making HQ ready to **rehearse** Tradify cutover and harden public/ops edges — without live accounting, telephony, or data mutation of Production customer records.

### In scope

1. Tradify import **staging + dry-run report** from frozen exports (customers/sites/jobs): counts, unmatched keys, collisions, staff mapping to `scheduling_staff`, expected inserts/updates — **read-only / local or isolated** until owner approves any write.
2. Documented import batch contract alignment with `docs/tradify-migration-and-google-calendar.md` (idempotent, reversible-by-batch design).
3. Enquiry **rate limiting / bot protection** for marketing intake (Preview-safe configuration).
4. Scheduling race posture decision: stay app-layer hard-block vs additive DB exclusion/advisory lock (design + optional migration **only after approval**).
5. Optional soft-confirm double-book override UX design/spike on current `main` (do **not** merge obsolete PR #4).
6. Doc/README hygiene so handover remains authoritative.

### Out of scope

- Live Tradify import into Production
- Reapplying the six commercial migrations
- Xero invoice writes / C2 billing UI
- Live Vapi cutover or Telstra number forward
- Client portal auth
- Inventory / purchasing / reports
- Mutating Production data or external integrations without approval

### GitHub branch state (post-cleanup)

- Origin keeps **`main` only**. Historical feature branches removed after owner approval.
- Obsolete PR #4 soft-confirm tip archived as tag `archive/pr-4-conflict-soft-confirm` (`4d8e631`) — do not merge wholesale; reimplement on `main` if soft-override is required.

### Acceptance criteria

- Dry-run produces a repeatable report artifact (JSON/Markdown) with insert/update/skip/collision counts and unmatched lists.
- No Production row writes occur during dry-run validation.
- Enquiry intake abuse controls are implemented and verified on Preview with fictional submissions.
- Owner has a written recommendation on DB-level overlap enforcement (implement later vs defer).
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass on the milestone tip.
- Handover docs still list Production baseline SHA `ffd7e09…` unless a later approved release updates it.

### Testing requirements

- Unit tests for import mapping/normalisation pure functions.
- Dry-run against frozen `imports/tradify/` CSVs (local-only; do not commit secrets or live credentials).
- Preview smoke: login roles, enquiry submit under rate limit, schedule overlap hard-block still holds.
- No Xero/Tradify/Vapi live calls; no hosted migration apply unless separately approved.

**Do not start this milestone until the owner explicitly approves scope.**
