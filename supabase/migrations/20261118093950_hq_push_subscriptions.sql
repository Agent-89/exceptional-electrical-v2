-- Opt-in Web Push subscriptions for HQ office staff (enquiry alerts).
create table public.hq_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hq_push_subscriptions_endpoint_key unique (endpoint),
  constraint hq_push_subscriptions_endpoint_len check (char_length(endpoint) between 20 and 2048),
  constraint hq_push_subscriptions_p256dh_len check (char_length(p256dh) between 20 and 512),
  constraint hq_push_subscriptions_auth_len check (char_length(auth) between 8 and 512)
);

create index hq_push_subscriptions_user_idx on public.hq_push_subscriptions (user_id);

alter table public.hq_push_subscriptions enable row level security;

create policy "staff read own push subscriptions"
  on public.hq_push_subscriptions
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_staff())
  );

create policy "staff insert own push subscriptions"
  on public.hq_push_subscriptions
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.is_staff())
  );

create policy "staff update own push subscriptions"
  on public.hq_push_subscriptions
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_staff())
  )
  with check (
    user_id = (select auth.uid())
    and (select private.is_staff())
  );

create policy "staff delete own push subscriptions"
  on public.hq_push_subscriptions
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and (select private.is_staff())
  );

grant select, insert, update, delete on public.hq_push_subscriptions to authenticated;
revoke all on public.hq_push_subscriptions from anon;
