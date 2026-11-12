-- Telemetry: what every paid API call costs, how books come into libraries, and
-- whether background jobs are running. Read by the admin page and the alert checks.

-- Every call to a paid API: Claude, Voyage, and ISBNdb. Written by the server, the
-- worker, and scripts (service role); only the service role reads it.
create table public.api_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  provider text not null,                -- anthropic, voyage, isbndb
  feature text not null,                 -- chat, title, greeting, condense, conversation_review, profile, ...
  model text,
  user_id uuid references auth.users (id) on delete set null,
  conversation_id uuid,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  calls integer not null default 1,      -- ISBNdb: calls charged against the daily quota
  cost_usd numeric(12, 6) not null default 0,
  batch boolean not null default false   -- Message Batches API, half price
);

create index idx_api_usage_created on public.api_usage (created_at);
create index idx_api_usage_feature on public.api_usage (feature, created_at);
create index idx_api_usage_user on public.api_usage (user_id, created_at) where user_id is not null;

alter table public.api_usage enable row level security;

-- Bring over chat usage recorded so far. chat_token_usage stays as it was, but the
-- server writes api_usage from now on. Cache writes before 11 November 2026 used the
-- 5-minute cache; priced at that rate.
insert into public.api_usage (
  created_at, provider, feature, model, user_id, conversation_id,
  input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_usd
)
select
  t.created_at, 'anthropic', coalesce(t.endpoint, 'chat'), t.model, t.user_id, t.conversation_id,
  coalesce(t.input_tokens, 0), coalesce(t.output_tokens, 0),
  coalesce(t.cache_creation_input_tokens, 0), coalesce(t.cache_read_input_tokens, 0),
  (
    coalesce(t.input_tokens, 0) * p.input + coalesce(t.output_tokens, 0) * p.output
    + coalesce(t.cache_creation_input_tokens, 0) * p.write5m + coalesce(t.cache_read_input_tokens, 0) * p.read
  ) / 1e6
from public.chat_token_usage t
cross join lateral (
  select
    case when t.model like 'claude-opus%' then 4 when t.model like 'claude-haiku%' then 0.1 else 2 end as input,
    case when t.model like 'claude-opus%' then 20 when t.model like 'claude-haiku%' then 0.5 else 10 end as output,
    case when t.model like 'claude-opus%' then 5 when t.model like 'claude-haiku%' then 0.125 else 2.5 end as write5m,
    case when t.model like 'claude-opus%' then 0.2 when t.model like 'claude-haiku%' then 0.01 else 0.1 end as read
) p
where exists (select 1 from auth.users u where u.id = t.user_id);

-- How a book came into the library: import, search (Add Book), chat (the AI, including
-- onboarding and lists), or release (from the Releases page). Null for books added
-- before this was recorded.
alter table public.books add column added_via text;

-- The latest state of each background job, for the admin page and stalled-job alerts
create table public.job_heartbeats (
  job text primary key,
  last_run_at timestamptz not null,
  last_ok_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  runs integer not null default 0,
  failures integer not null default 0
);

alter table public.job_heartbeats enable row level security;

-- The first fill of book embeddings (11 November 2026), before usage was recorded
insert into public.api_usage (created_at, provider, feature, model, input_tokens, cost_usd)
values ('2026-11-11 20:45:00+00', 'voyage', 'book_embeddings', 'voyage-4', 488474, 488474 * 0.06 / 1e6);

-- Everything the admin page shows, in one call. Service role only: the server checks
-- that the caller is an admin (ADMIN_USER_IDS) before calling it.
create or replace function public.admin_overview(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with bounds as (
    select
      date_trunc('day', now()) - make_interval(days => greatest(p_days, 1) - 1) as since,
      date_trunc('day', now()) as today,
      date_trunc('month', now()) as month_start
  ),
  usage_window as (
    select a.* from api_usage a, bounds b where a.created_at >= b.since
  ),
  groups as (
    select
      a.*,
      case
        when a.provider = 'anthropic' and a.feature in ('chat', 'title', 'greeting', 'condense') then 'chat'
        when a.provider = 'anthropic' then 'background'
        else a.provider
      end as grp
    from api_usage a, bounds b
    where a.created_at >= b.month_start or a.created_at >= b.since
  )
  select jsonb_build_object(
    'generated_at', now(),
    'days', p_days,
    'daily_costs', (
      select coalesce(jsonb_agg(d order by d.day, d.feature), '[]'::jsonb) from (
        select date_trunc('day', created_at)::date as day, provider, feature,
               round(sum(cost_usd)::numeric, 4)::float as cost, sum(calls)::int as calls,
               sum(input_tokens + output_tokens + cache_write_tokens + cache_read_tokens)::bigint as tokens
        from usage_window group by 1, 2, 3
      ) d
    ),
    'reader_costs', (
      select coalesce(jsonb_agg(r order by r.cost desc), '[]'::jsonb) from (
        select a.user_id, u.email, round(sum(a.cost_usd)::numeric, 4)::float as cost,
               (count(*) filter (where a.feature = 'chat'))::int as chat_calls
        from usage_window a join auth.users u on u.id = a.user_id
        group by 1, 2 order by 3 desc limit 25
      ) r
    ),
    'daily_activity', (
      select coalesce(jsonb_agg(x order by x.day), '[]'::jsonb) from (
        select d::date as day,
          (select count(*) from auth.users where created_at >= d and created_at < d + interval '1 day')::int as signups,
          (select count(*) from messages m
             where m.role = 'user' and m.created_at >= d and m.created_at < d + interval '1 day')::int as chat_messages,
          (select count(distinct c.user_id) from messages m join conversations c on c.id = m.conversation_id
             where m.role = 'user' and m.created_at >= d and m.created_at < d + interval '1 day')::int as chatting_readers,
          coalesce((select jsonb_object_agg(coalesce(added_via, 'unknown'), n) from (
             select added_via, count(*)::int as n from books
             where created_at >= d and created_at < d + interval '1 day' group by 1
          ) b), '{}'::jsonb) as books_added
        from bounds, generate_series(bounds.since, bounds.today, interval '1 day') as d
      ) x
    ),
    'spend_today', (
      select coalesce(jsonb_object_agg(grp, cost), '{}'::jsonb) from (
        select grp, round(sum(cost_usd)::numeric, 4)::float as cost
        from groups, bounds where created_at >= bounds.today group by 1
      ) s
    ),
    'spend_month', (
      select coalesce(jsonb_object_agg(grp, cost), '{}'::jsonb) from (
        select grp, round(sum(cost_usd)::numeric, 4)::float as cost
        from groups, bounds where created_at >= bounds.month_start group by 1
      ) s
    ),
    'totals', jsonb_build_object(
      'readers', (select count(*) from auth.users),
      'readers_signed_in_7d', (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'readers_chatting_7d', (select count(distinct c.user_id) from messages m join conversations c on c.id = m.conversation_id
                              where m.role = 'user' and m.created_at > now() - interval '7 days'),
      'paid_readers', (select count(*) from user_subscriptions where plan <> 'free' and status in ('active', 'trialing')),
      'curating_readers', (select count(*) from release_curation),
      'books', (select count(*) from books),
      'books_waiting_for_details', (select count(*) from books where isbn is not null and isbndb_enriched_at is null)
    ),
    'quotas', jsonb_build_object(
      'isbndb', (select to_jsonb(q) from (select remaining, resets_at, updated_at from api_quota where service = 'isbndb') q),
      'isbndb_calls_today', (select coalesce(sum(calls), 0) from api_usage, bounds where provider = 'isbndb' and created_at >= bounds.today),
      'voyage_tokens_total', (select coalesce(sum(input_tokens), 0) from api_usage where provider = 'voyage'),
      'database_bytes', pg_database_size(current_database())
    ),
    'jobs', (select coalesce(jsonb_agg(j order by j.job), '[]'::jsonb) from job_heartbeats j)
  );
$$;

revoke all on function public.admin_overview(integer) from public, anon, authenticated;
grant execute on function public.admin_overview(integer) to service_role;
