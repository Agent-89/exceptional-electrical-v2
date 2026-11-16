# Release candidate — commercial Production baseline

## Candidate

- Branch: `feature/hq-quote-workspace-ux`
- Base stack: PR #12 → #13 → #14 (all Draft until approved)
- Hosted Supabase: `udwdurnknweavmksotii` (shared Preview/Production)

## Merge order (after Preview approval)

1. Merge PR #12 into `main` (do not reapply commercial migrations).
2. Retarget PR #13 to `main` (or merge via updated stack), then merge.
3. Retarget PR #14 to `main`, then merge (include any RC fix commits on the UX branch).
4. Deploy Production from the resulting `main` SHA only after smoke tests pass.

## Preview preparation (do not deploy until authorised)

1. Confirm Vercel env vars are set for Preview (names in `docs/CURSOR_HANDOVER.md`; no secrets in Git).
2. Deploy Preview for the tested RC SHA / open PR #14 (or stacked preview).
3. Smoke-test with **fictional** customers, jobs, quotes only.
4. Avoid: Xero, Tradify writes, Vapi live calls, real customer communications, Google Calendar write-back (read-only Neil path only if already connected).

## Smoke-test checklist (fictional data)

- [ ] Login as owner/admin, office, technician — correct homes and nav
- [ ] Create enquiry → convert to customer
- [ ] Create job; schedule multi-electrician appointment (overlap hard-block verified)
- [ ] Timeline reschedule with/without crew conflict
- [ ] Visit editor reschedule + crew change with/without overlap
- [ ] Technician timer start/break/finish; visit report; timesheet visibility
- [ ] Office time correction + approve/reject
- [ ] Quote create, variation, multi-job link, unlink, customer-change guard
- [ ] Quote PDF + preview
- [ ] Notes, photos, attachments on job
- [ ] Light/dark if supported; desktop + mobile nav

## Rollback

- Application: redeploy previous Vercel Production deployment or revert merge on `main`.
- Database: no migration rollback expected for this release (commercial SQL already hosted). Forward-fix only if a new migration is later approved and fails.
