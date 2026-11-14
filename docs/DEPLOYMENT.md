# Deployment and security gates

1. Connect this repository to a new Vercel project. Do not point the live business domain here until approved.
2. Configure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` in Vercel server environment. Secret key must never use `NEXT_PUBLIC_`.
3. Apply committed migrations carefully on **new/staging** projects only. Historical job/scheduling migrations are incomplete relative to production (see `docs/tradify-migration-and-google-calendar.md`). Do not rewrite already-applied migration files; a separate forward-only reconciliation migration is required before greenfield clones match live HQ.
4. Create HQ login users in Supabase Auth, then provision `staff_profiles`. Electricians on jobs/schedule use `scheduling_staff` (optional `auth_user_id`); do not conflate those ids with `staff_profiles.user_id`.
5. Enquiry endpoint needs production-grade edge rate limiting, bot protection, monitoring and notification delivery before marketing launch.
6. Confirm business details, real logo asset, service claims, actual contact methods, privacy policy and licensed photography before domain launch.
7. Vapi/phone integrations remain disconnected until a separate integration milestone and webhook signature verification.
8. The `/hq` and `/portal` routes are public **placeholder pages only**. Do not put customer data or operational controls in them until authentication/authorization is implemented.
