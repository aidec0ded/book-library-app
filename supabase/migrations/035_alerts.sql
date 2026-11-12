-- Alerts and the daily check of recorded AI costs against Anthropic's own figures
-- (server/alerts.ts, server/cost-reconciliation.ts). Both run in the background worker.
-- Only the service role reads or writes these tables.

-- One row per alert sent, so each goes out once: the key names the alert and its
-- period (for example "chat_stop:2026-11-12" or "job_failing:embeddings:2026-11-12")
create table public.alerts_sent (
  key text primary key,
  subject text not null,
  sent_at timestamptz not null default now()
);

alter table public.alerts_sent enable row level security;

-- Per UTC day and Anthropic workspace: what Anthropic billed and what the app recorded
-- in api_usage for the same calls. Workspace "chat" is the chat key's workspace,
-- "jobs" the background key's, "other" any other workspace (for example an old key).
create table public.cost_reconciliation (
  day date not null,
  workspace text not null,
  workspace_name text,
  anthropic_usd numeric(12, 4) not null,
  recorded_usd numeric(12, 4) not null,
  checked_at timestamptz not null default now(),
  primary key (day, workspace)
);

alter table public.cost_reconciliation enable row level security;

-- Signups since a time, for the signup-spike alert
create or replace function public.admin_signups_since(p_since timestamptz)
returns integer
language sql
stable
security definer
set search_path = public, auth
as $$
  select count(*)::int from auth.users where created_at >= p_since;
$$;

-- Readers on a paid plan who've used their monthly replies, for the cap alert
create or replace function public.admin_capped_readers(p_cap integer)
returns table (user_id uuid, email text, used integer)
language sql
stable
security definer
set search_path = public, auth
as $$
  select s.user_id, u.email::text, s.chat_messages_used
  from user_subscriptions s
  join auth.users u on u.id = s.user_id
  where s.plan <> 'free'
    and s.status in ('active', 'trialing')
    and s.chat_messages_used >= p_cap
    and s.chat_messages_period_start >= date_trunc('month', now());
$$;

revoke all on function public.admin_signups_since(timestamptz) from public, anon, authenticated;
revoke all on function public.admin_capped_readers(integer) from public, anon, authenticated;
grant execute on function public.admin_signups_since(timestamptz) to service_role;
grant execute on function public.admin_capped_readers(integer) to service_role;
