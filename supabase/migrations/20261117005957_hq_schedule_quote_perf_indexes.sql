-- HQ schedule / jobs / quotes list performance indexes.
-- Forward-only. Do NOT apply to hosted Preview/Production without explicit owner approval.
-- Preview shares Production data (udwdurnknweavmksotii).

-- Schedule week load + jobs list "next visit" filters.
create index if not exists job_appointments_status_starts_at_idx
  on public.job_appointments (status, starts_at);

-- Visit crew lookup scoped by appointment_id (schedule + job detail).
create index if not exists job_appointment_staff_appointment_id_idx
  on public.job_appointment_staff (appointment_id);

-- Quote register / detail item totals.
create index if not exists quote_items_quote_id_idx
  on public.quote_items (quote_id);

create index if not exists quotes_created_at_idx
  on public.quotes (created_at desc);

create index if not exists quotes_customer_id_idx
  on public.quotes (customer_id);
