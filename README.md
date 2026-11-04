# Exceptional Electrical V2

A fresh, independently developed platform for Exceptional Electrical.

## Product areas

- **Marketing website** (`/`): premium, modern public website based on the approved visual concept, with clear service information and enquiry/quote calls to action.
- **Staff HQ** (`/hq`): authenticated reception inbox, customer management, jobs, scheduling, inventory, quotes and invoices.
- **Client portal** (`/portal`, later phase): separate authenticated experience for customers to track their own projects, ask questions, make requests and access documents.

## Architecture decisions

- New Next.js App Router + TypeScript + Tailwind application; do **not** copy the previous repository wholesale.
- One codebase with clearly separated public, staff and customer areas.
- New Supabase project and database. Do **not** connect to the previous Supabase project or import its data.
- Strict role and ownership checks, RLS on exposed tables, server-side integration secrets, and migrations tracked in Git.
- Vapi receptionist is designed as the primary call handler, subject to client approval and telephone routing verification.
- Calls and website enquiries enter one inbox. Automated booking is only permitted after server-side eligibility and real availability checks.
- A separate staging environment is required before any live customer information is processed.

## Approved marketing design direction

Premium and modern, using the existing Exceptional Electrical logo and its electric-blue/steel-grey identity. White navigation, large architectural imagery, dark navy hero, bold typography, bright spacious service sections, mobile-first calls to action. The design mockup is a visual reference, not verified business copy or production photography.

## Initial milestones

1. Bootstrap application, linting, formatting, tests and CI.
2. Implement responsive marketing homepage against approved visual reference.
3. Establish new Supabase project and migration-backed schema.
4. Build a complete enquiry intake -> reception inbox -> follow-up workflow.
5. Add staff HQ modules iteratively.
6. Build the separate client portal once staff/customer access boundaries are verified.

## Operational notes

The original `Agent-89/exceptional-electrical` repository remains untouched and is reference-only. The previous Vapi webhook points to the old Supabase project until deliberately reconfigured and tested. Never publish unverified phone numbers, licences, reviews, guarantees or emergency-service claims.
