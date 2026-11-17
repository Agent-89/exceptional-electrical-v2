-- Keep Vapi call intake audit rows when HQ hard-deletes empty enquiries/customers.
-- Hosted FKs were ON DELETE NO ACTION, which blocked empty-delete after eligibility passed.

alter table public.vapi_call_intake
  drop constraint if exists vapi_call_intake_enquiry_id_fkey;

alter table public.vapi_call_intake
  add constraint vapi_call_intake_enquiry_id_fkey
  foreign key (enquiry_id) references public.enquiries(id) on delete set null;

alter table public.vapi_call_intake
  drop constraint if exists vapi_call_intake_customer_id_fkey;

alter table public.vapi_call_intake
  add constraint vapi_call_intake_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete set null;
