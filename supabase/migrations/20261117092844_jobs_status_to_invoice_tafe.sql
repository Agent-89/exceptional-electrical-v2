-- Expand jobs.status check for HQ operational statuses used in Production
-- (includes assigned) plus Tradify-parity to_invoice and tafe.
-- Additive / forward-only. Do not apply to hosted until owner approves.

alter table public.jobs
  drop constraint if exists jobs_status_check;

alter table public.jobs
  add constraint jobs_status_check
  check (
    status in (
      'unassigned',
      'assigned',
      'scheduled',
      'in_progress',
      'on_hold',
      'to_invoice',
      'tafe',
      'completed',
      'cancelled'
    )
  );
