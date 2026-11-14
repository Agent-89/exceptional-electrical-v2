-- Forward-only: idempotent HQ job creation.
-- Adds nullable create_idempotency_key + partial unique index.
-- Retries/double-submits reuse one job; multiple jobs per customer/quote remain allowed.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS create_idempotency_key uuid;

COMMENT ON COLUMN public.jobs.create_idempotency_key IS
  'Client-generated UUID for a single HQ create-job attempt. Unique so retries cannot insert a second job.';

CREATE UNIQUE INDEX IF NOT EXISTS jobs_create_idempotency_key_uidx
  ON public.jobs (create_idempotency_key)
  WHERE create_idempotency_key IS NOT NULL;
