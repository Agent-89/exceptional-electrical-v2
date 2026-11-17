# Scheduling overlap posture (owner recommendation)

Status: **recommendation recorded** for the Tradify dry-run + lean ops hardening milestone (Nov 2026).  
No schema migration ships with this note.

## Current behaviour (Production baseline)

- **HQ electrician overlaps** are hard-blocked in the application layer on appointment create and schedule edit paths (`src/lib/hq-electrician-overlaps.ts` and schedule/job actions). There is no owner/admin override.
- **Neil Google Calendar busy** events hard-block when Neil is on the visit crew (`src/lib/neil-calendar-conflicts.ts`). Independent of HQ overlaps; also non-bypassable.
- There is **no** Postgres exclusion constraint or advisory-lock pair covering `(staff_id, time range)` today. Two concurrent writes could theoretically race past the app-layer read-then-write check.

## Recommendation

**Keep app-layer hard-blocks as the enforcement model for now. Defer DB-level exclusion / advisory locks until after a controlled Tradify import.**

### Why defer DB locks

1. **Cutover first.** Importing customers/sites/jobs will change appointment volume and staff mapping (`scheduling_staff`). Designing exclusion constraints against today’s thin HQ history risks the wrong key shape (e.g. staff id vs auth user id confusion).
2. **App-layer already matches product rules.** Neil busy and HQ overlap are separate policies with different inputs (Google events vs HQ visits). A single DB exclusion cannot express Neil’s calendar without also storing busy intervals in Postgres.
3. **Race window is real but narrow.** Office concurrency is low; the failure mode is a rare double-book, not silent data corruption. Monitoring / support can unwind a duplicate visit more cheaply than an emergency constraint rollout during import rehearsal.
4. **Soft-confirm override is out of scope.** Do **not** revive obsolete Draft PR #4 (`archive/pr-4-conflict-soft-confirm`). If owners later want a double-book override, reimplement on current `main` as an explicit product decision — separate from race hardening.

### When to revisit DB enforcement

After Tradify history is imported (or a dry-run proves stable mapping) **and** owners want defence-in-depth, consider an **additive** migration only with approval:

- Prefer an exclusion constraint or GiST range on appointment staff membership for HQ visits, keeping Neil Google checks in app code.
- Or short transactional advisory locks keyed by `scheduling_staff.id` + day bucket around create/edit.
- Still forward-only; never rewrite applied migrations.

Until then: treat the current hard-block paths as the source of truth, keep Preview/Production smoke coverage on overlap create/edit, and do not merge soft-override UX.
