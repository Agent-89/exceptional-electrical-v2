# Deployment and security gates

1. Connect this repository to a new Vercel project. Do not point the live business domain here until approved.
2. Configure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` in Vercel server environment. Secret key must never use `NEXT_PUBLIC_`.
3. Apply the committed migration to the **new** project `udwdurnknweavmksotii` only. Verify RLS and Supabase security advisors.
4. Create staff users in Supabase Auth, then provision `staff_profiles` via trusted admin workflow (not public client code).
5. Enquiry endpoint needs production-grade edge rate limiting, bot protection, monitoring and notification delivery before marketing launch.
6. Confirm business details, real logo asset, service claims, actual contact methods, privacy policy and licensed photography before domain launch.
7. Vapi/phone integrations remain disconnected until a separate integration milestone and webhook signature verification.
8. The `/hq` and `/portal` routes are public **placeholder pages only**. Do not put customer data or operational controls in them until authentication/authorization is implemented.
