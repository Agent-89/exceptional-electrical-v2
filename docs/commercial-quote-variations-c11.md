# Milestone C1.1 — Quote navigation & variation relationships

**Status:** Local implementation on `feature/hq-c11-quote-variations`. Do not push, merge PR #12, or apply hosted migrations until approved.  
**Depends on:** C1 multi-quote job linking (PR #12 / `job_quotes`), still draft and unmerged.  
**Hosted project (verified read-only):** `udwdurnknweavmksotii`

## Confirmed decisions (locked)

| Topic | Decision |
| --- | --- |
| Numbering | Every quote **and** every variation gets a normal unique `EEQ-######` from `quote_number_seq`. No `-V01` suffixes. |
| Variation meaning | A variation is a **full revised quotation**, not an incremental add-on charge. |
| Relationship | Structured parent link (`parent_quote_id` / `revision_number`), not title-only labelling. |
| History | Retain all earlier quotes and activity. |
| Who may make current | Owner and authorised office staff (existing office permissions). |
| Accept → current | Accepting a **revised** quotation auto-makes it commercial current, subject to validation / billing safeguards. |
| Primary vs current | A job’s primary quote **may be a draft**. Primary selection and commercial current are separate; changing primary does not change acceptance/supersession. |
| Supersession | Draft / approved / sent variation must **not** auto-supersede until make-current (or accepted-revision path). |
| Future costing / invoicing | Use the **current** commercial version; never sum superseded + replacement totals. |
| Builder | Reuse the existing quote builder; no second builder. |
| Job context | Preserve originating job; breadcrumbs; Back to job; Save & return / Save & continue; auto-link after save. |

---

## Phase 0 — Existing schema inspection (no change yet)

### Already present on Production baseline (`prod_schema_20261114.sql`)

| Object | Role for C1.1 |
| --- | --- |
| `quotes.quote_number` + `quote_number_seq` | Unique `EEQ-######` default. **Keep as-is.** |
| `quotes.parent_quote_id` → `quotes(id)` ON DELETE RESTRICT | Structured revision parent. **Reuse.** |
| `quotes.revision_number` + `quote_revision_link` | `0` ⇒ no parent; `>0` ⇒ parent required. **Reuse.** |
| `quotes.status` includes `superseded` | Lifecycle value for replaced versions. **Reuse.** |
| `quotes_parent_idx` | Parent lookups. |
| `save_quote_draft_atomic` | Creates/updates drafts but **does not** set `parent_quote_id` / `revision_number` today. |
| HQ lifecycle actions | draft → approve → sent → accepted/declined; preview treats `superseded` as printable. |

### Present in C1 (PR #12, not hosted yet)

| Object | Role |
| --- | --- |
| `job_quotes` | Job ↔ quote associations; `is_primary`; optional `association_kind` / `label`. |
| Job Quotes tab create actions | Currently create a draft via RPC and link; “New variation” only sets `association_kind='variation'` + title/label — **not** `parent_quote_id`. |

### Gaps (app / RPC, not missing columns)

1. Quote builder has no Standard / Variation control and never writes `parent_quote_id`.
2. No explicit “make current version” / supersede transition.
3. No job return navigation (`returnTo`, Save & return, breadcrumbs).
4. No optional “Linked job” picker on standalone quote create.
5. `job_quotes.association_kind='variation'` is a **job association tag**, not the commercial parent relationship — C1.1 must not treat that label as the source of truth for revision lineage.

**Conclusion:** Prefer **minimal additive migrations**. Do not rewrite issued quote numbers or historical rows. Prefer app + RPC extensions over new numbering schemes.

---

## Proposed commercial model

### Quote identity

```text
Standard quote:  parent_quote_id IS NULL, revision_number = 0, quote_number = EEQ-######
Variation:       parent_quote_id = <prior quote>, revision_number = parent.revision_number + 1
                 quote_number = next EEQ-###### (independent number)
```

- Parent may be a standard quote **or** an earlier variation (chain allowed).
- Display: show own `EEQ-…` plus “Revision of EEQ-… (rev N)” — never invent `-V01`.

### Same-customer / same-job rules

| Rule | Enforcement |
| --- | --- |
| Variation customer must equal parent customer | Server + RPC |
| If creating from a job, quote customer must equal job customer | Existing C1 gate |
| If both parent and child are linked to jobs, they must share the **same** job (when a job context exists) | Server: either inherit originating `job_id`, or reject cross-job parent selection |
| Office-only mutations | `assertOfficeOps` + service-role RPCs |

### Current version (for future costing / invoicing)

**Definition (proposed):** within a revision family (walk to root via `parent_quote_id`), the **current** quote is the unique non-`superseded` / non-`cancelled` member that has been explicitly designated current (see transition below). Until that transition runs, an approved/accepted parent remains current even if a draft variation exists.

**Job pointer alignment:**

- `jobs.quote_id` + `job_quotes.is_primary` continue to mean the job’s **primary commercial quote** (C1).
- When a variation is made current for a job-linked family, update primary to the new quote in the same atomic transition (reuse C1 sync patterns).
- Costing/invoicing (later milestones) must resolve **current version only** — never sum family totals.

### Supersession transition (explicit)

**Action name (UI):** “Make current version” (office; likely owner/admin for accepted parents — confirm with business; default proposal: same as quote approve capability for accepted parents, office for draft→current only if never issued).

**Preconditions:**

1. Target quote is `approved`, `sent`, or `accepted` (not draft).
2. Target has a `parent_quote_id` (it is a variation) **or** is being designated current among siblings (same root).
3. Actor is authorised.
4. Customer (and job, if linked) compatibility holds.

**Effects (one transaction):**

1. Set previous current in the family (status in `approved|sent|accepted`) to `superseded` (activity log on each).
2. Leave declined/expired/cancelled untouched.
3. Do **not** delete any quote or items.
4. If family is linked to a job: set that job’s primary to the new current quote (`job_quote_set_primary_atomic` / equivalent).
5. Return clear success/error; concurrent attempts fail with refresh/retry.

**Non-effects:**

- Creating or saving a draft variation does nothing to parent status.
- Approving a variation does **not** auto-supersede until “Make current version” (keeps approved variation available for review alongside prior accepted quote).

> Alternative (if business prefers fewer clicks later): optional follow-up to auto-run “Make current” when a variation is **accepted**. Not in C1.1 MVP unless confirmed.

---

## Proposed UX (reuse `QuoteEditor`)

### Builder additions

1. **Quote type:** Standard Quote | Variation (radio/select near title).
2. If Variation: **Parent quote** picker (same customer; prefer quotes already on the same job when `jobId` present).
3. Read-only chips: Parent `EEQ-…`, revision number, Linked job (if any), Current/Superseded badge.
4. Sticky actions:
   - **Save & continue editing**
   - **Save & return to job** (only when originating/linked job present)
5. Breadcrumbs: `Jobs → JB##### → Quotes → EEQ-…` or `Quotes → EEQ-…`.
6. **← Back to job** when job context exists.

### Job Quotes tab

- **New quote** → `/hq/quotes/new?job=<id>&returnTo=job` (or `/hq/quotes/new?job=…`) prefills customer, links on first successful save.
- **New variation** → same builder with `type=variation` and optional `parent=<quoteId>` when launched from a row.
- After Save & return: `/hq/jobs/<id>?tab=quotes&notice=…` with association present.
- Stop using title-only “Variation — …” as the relationship; title may still be human-edited.

### Quotes created outside a job

- Optional **Linked job** picker (jobs for this customer only).
- On save: if selected, insert/upsert `job_quotes` (non-primary unless job has no primary).

---

## Migration requirements (proposed — not applied)

### Prefer no table rewrite

| Change | Needed? | Notes |
| --- | --- | --- |
| New quote number format | **No** | Keep `quote_number_seq` / unique `EEQ-######`. |
| New `parent_quote_id` column | **No** | Already exists. |
| New `revision_number` | **No** | Already exists. |
| New `superseded` status | **No** | Already in CHECK. |
| Extend `save_quote_draft_atomic` | **Yes (forward-only RPC replace)** | Accept/persist `parent_quote_id` + computed `revision_number` on insert; validate customer; refuse changing parent after issue. |
| `make_quote_current_atomic` RPC | **Yes** | Supersession + optional job primary update; `service_role` only. |
| `job_quotes` changes | **Maybe none** | Keep linking via C1. Optionally stop overloading `association_kind='variation'` as lineage; use quote parent instead. Labels remain optional UI hints. |
| New “current” column | **Yes (additive)** | `commercial_family_id` + `is_commercial_current` with partial unique index — status alone cannot uniquely identify current when approved parent + approved variation coexist. Job primary is **not** overloaded. |

### Compatibility

- Existing quotes: `revision_number = 0`, `parent_quote_id` null → Standard.
- Issued numbers never rewritten.
- C1 `job_quotes` backfill unchanged.
- Preview/PDF already allow `superseded` as printable history.

### Hosted apply order (after PR approval)

1. Finish/merge C1 migrations (`job_quotes` + atomic ops + create/link hardening) if not already applied.  
2. Apply C1.1 forward-only RPC migration(s).  
3. Deploy app.  
4. Smoke with fictional data only.

---

## Tests to add (when implementing)

| Area | Cases |
| --- | --- |
| Numbering | Variation insert allocates next `EEQ-######`; unique; no suffix. |
| Parent rules | Variation requires parent; revision = parent.revision + 1; same customer; reject cross-customer; reject cross-job when job-scoped. |
| Non-auto supersede | Draft/approved variation leaves parent `accepted` until explicit transition. |
| Make current | Prior current → `superseded`; new current primary on job; concurrent conflict message; history retained. |
| Costing guard (unit) | Helper `resolveCurrentQuoteTotal(family)` ignores superseded siblings (prep for invoices). |
| Navigation | `returnTo` save paths; breadcrumbs; link created after save from job; optional linked job from standalone create. |
| Auth | Office-only; service-role RPC grants only. |

---

## Implementation sequence (local first)

1. **This proposal** reviewed and accepted (no Vercel push required for docs-only).  
2. Implement against local Supabase: builder fields → save RPC → navigation → make-current RPC → tests.  
3. Keep work on a **local** branch or unpushed commits until ready (avoid Preview rebuilds while iterating).  
4. Open/update PR only when C1.1 is review-ready; keep PR #12 unmerged until C1 migrations are approved separately.  
5. No hosted migration / no real customer data / no Production deploy from this proposal step.

---

## Out of scope for C1.1

- Invoice assembly and Xero writes.  
- Automatic email of variations.  
- Rewriting Tradify-imported quotes.  
- Summing multiple active quotes as “job value” (explicitly forbidden for superseded families).

---

## Confirmed (implementation)

1. Who may run “Make current version” — **office** (existing office permissions), including owner/admin; target must already be **accepted**.  
2. Accepting a quotation runs `accept_quote_atomic` (accept evidence + commercial current in one transaction).  
3. Job primary **may** point at a draft; primary changes do **not** alter commercial current.  
4. `is_commercial_current` means the **accepted** commercial version only. Draft / approved / sent never backfill as current. Families may have no current. Backfill clears all flags then sets the deterministic accepted winner (latest `accepted_at`).  
5. Variations require `parent_quote_id`. Parent / family / revision are immutable; customer must stay compatible with parent (DB trigger + RPC).  
6. Automatic supersession targets **only** the previous accepted commercial current. Pending approved/sent revisions remain available.  
7. Legacy association-kind-only create path redirects to the builder.

## Billing safety (C1.1 → C2)

- C1.1 **does not** establish whether historical invoices or payments exist outside HQ (Tradify, Xero, paper, etc.).
- Do **not** automatically make invoicing decisions from `is_commercial_current` alone.
- Full billing reconciliation, invoice lineage, and payment safety belong to **C2**.
- Local stub: if HQ invoice tables appear later, automatic supersession may block for office review; that is not a complete billing model.
