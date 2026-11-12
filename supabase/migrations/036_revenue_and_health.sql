-- Revenue, fixed costs, and server memory for the telemetry page and alerts
-- (server/stripe-handler.ts, server/stripe-reconciliation.ts, server/health.ts).
-- Only the service role reads or writes these tables.

-- Every payment, refund, and dispute from Stripe's webhook, plus subscriptions
-- started and ended. Payments are positive, refunds negative; disputes and
-- subscription changes have amount 0 (a dispute's amount is in details).
create table public.billing_events (
  id text primary key, -- Stripe's id: invoice, refund, dispute, or "subscribed:"/"canceled:" + subscription
  kind text not null check (kind in ('payment', 'refund', 'dispute', 'payment_failed', 'subscribed', 'canceled')),
  user_id uuid references auth.users (id) on delete set null,
  stripe_customer_id text,
  plan text,
  amount_usd numeric(10, 2) not null default 0,
  fee_usd numeric(10, 2), -- Stripe's fee on a payment, from its balance transaction
  occurred_at timestamptz not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index billing_events_occurred_at on public.billing_events (occurred_at);
create index billing_events_user on public.billing_events (user_id, occurred_at desc);
alter table public.billing_events enable row level security;

-- Per UTC day: what moved through Stripe's balance (charges less refunds) and its
-- fees, against what the webhook recorded, so a missed webhook shows up
create table public.stripe_reconciliation (
  day date primary key,
  stripe_usd numeric(10, 2) not null,
  stripe_fees_usd numeric(10, 2) not null,
  recorded_usd numeric(10, 2) not null,
  checked_at timestamptz not null default now()
);

alter table public.stripe_reconciliation enable row level security;

-- Monthly bills that don't depend on usage, for profit and break-even on the
-- telemetry page. Edit in the Table Editor when a bill changes; annual bills go in
-- as their monthly share.
create table public.fixed_costs (
  name text primary key,
  monthly_usd numeric(10, 2) not null check (monthly_usd >= 0),
  notes text,
  updated_at timestamptz not null default now()
);

alter table public.fixed_costs enable row level security;

-- Each server's memory, reported every 5 minutes on Render: the whole container
-- (the server and any scripts it started), its limit, and today's peak
create table public.service_health (
  service text primary key, -- 'web' or 'worker'
  memory_mb numeric(8, 1) not null,
  limit_mb numeric(8, 1),
  process_mb numeric(8, 1),
  peak_mb numeric(8, 1) not null,
  peak_day date not null,
  started_at timestamptz,
  reported_at timestamptz not null default now()
);

alter table public.service_health enable row level security;

-- Everything the telemetry page shows about money coming in
create or replace function public.admin_revenue()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with bounds as (
    select date_trunc('month', now()) as month_start, now() - interval '30 days' as last_30
  ),
  latest_payment as (
    select distinct on (user_id) user_id, plan, amount_usd, fee_usd
    from billing_events
    where kind = 'payment' and user_id is not null
    order by user_id, occurred_at desc
  ),
  stripe_subs as (
    select user_id, plan from user_subscriptions
    where stripe_subscription_id is not null and status in ('active', 'trialing', 'past_due')
  ),
  paid_readers as (
    select s.user_id, s.plan, (s.stripe_subscription_id is not null) as paying
    from user_subscriptions s
    where s.plan <> 'free' and s.status in ('active', 'trialing', 'past_due')
  )
  select jsonb_build_object(
    'month', (
      select jsonb_build_object(
        'payments', coalesce(sum(amount_usd) filter (where kind = 'payment'), 0),
        'refunds', coalesce(-sum(amount_usd) filter (where kind = 'refund'), 0),
        'fees', coalesce(sum(fee_usd), 0),
        'payment_count', count(*) filter (where kind = 'payment'),
        'subscribed', count(*) filter (where kind = 'subscribed'),
        'canceled', count(*) filter (where kind = 'canceled'),
        'disputes', count(*) filter (where kind = 'dispute'),
        'failed_payments', count(*) filter (where kind = 'payment_failed')
      )
      from billing_events, bounds where occurred_at >= bounds.month_start
    ),
    -- Monthly recurring revenue: each paying reader's latest payment, annual as a twelfth
    'mrr', (
      select coalesce(sum(case when lp.plan = 'annual' then lp.amount_usd / 12 else lp.amount_usd end), 0)
      from stripe_subs s left join latest_payment lp using (user_id)
    ),
    'paying_readers', (select count(*) from stripe_subs),
    'complimentary_readers', (select count(*) from paid_readers where not paying),
    'month_api_cost', (select coalesce(sum(cost_usd), 0) from api_usage, bounds where created_at >= bounds.month_start),
    'last_30_api_cost', (select coalesce(sum(cost_usd), 0) from api_usage, bounds where created_at >= bounds.last_30),
    'free_reader_cost_30', (
      select coalesce(sum(a.cost_usd), 0) from api_usage a, bounds
      where a.created_at >= bounds.last_30 and a.user_id is not null
        and a.user_id not in (select user_id from paid_readers)
    ),
    -- Each reader on a paid plan: a month of revenue (net of Stripe's fee) against
    -- their AI and API cost over the last 30 days
    'readers', (
      select coalesce(jsonb_agg(r order by r.cost_30 desc), '[]'::jsonb) from (
        select p.user_id, u.email::text as email, p.plan, p.paying,
          coalesce(case when lp.plan = 'annual' then lp.amount_usd / 12 else lp.amount_usd end, 0)::float as monthly_revenue,
          coalesce(case when lp.plan = 'annual' then lp.fee_usd / 12 else lp.fee_usd end, 0)::float as monthly_fee,
          coalesce((select sum(a.cost_usd) from api_usage a, bounds
                    where a.user_id = p.user_id and a.created_at >= bounds.last_30), 0)::float as cost_30
        from paid_readers p
        join auth.users u on u.id = p.user_id
        left join latest_payment lp on lp.user_id = p.user_id
      ) r
    ),
    'recent', (
      select coalesce(jsonb_agg(e order by e.occurred_at desc), '[]'::jsonb) from (
        select b.id, b.kind, b.plan, b.amount_usd::float as amount_usd, b.fee_usd::float as fee_usd,
               b.occurred_at, b.details, u.email::text as email
        from billing_events b left join auth.users u on u.id = b.user_id
        order by b.occurred_at desc limit 20
      ) e
    ),
    'fixed_costs', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'monthly_usd', monthly_usd::float, 'notes', notes)
                                order by monthly_usd desc), '[]'::jsonb)
      from fixed_costs
    ),
    'reconciliation', (
      select coalesce(jsonb_agg(x order by x.day desc), '[]'::jsonb) from (
        select day, stripe_usd::float as stripe_usd, stripe_fees_usd::float as stripe_fees_usd,
               recorded_usd::float as recorded_usd, checked_at
        from stripe_reconciliation order by day desc limit 14
      ) x
    ),
    'services', (
      select coalesce(jsonb_agg(s order by s.service), '[]'::jsonb) from (
        select service, memory_mb::float as memory_mb, limit_mb::float as limit_mb, process_mb::float as process_mb,
               peak_mb::float as peak_mb, peak_day, started_at, reported_at
        from service_health
      ) s
    )
  );
$$;

revoke all on function public.admin_revenue() from public, anon, authenticated;
grant execute on function public.admin_revenue() to service_role;
