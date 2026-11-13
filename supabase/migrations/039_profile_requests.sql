-- Profiles the reader generates (server/profile-scheduler.ts). A reader's first profile
-- is still automatic. After that, when a monthly profile is due (30 days and new
-- activity), the scheduler marks it available and the reader generates it with a click;
-- Companion readers can also refresh weekly. The worker picks up requests every minute.
create table public.profile_requests (
  user_id uuid primary key references auth.users (id) on delete cascade,
  available_at timestamptz, -- a monthly profile is due; cleared when one is generated
  requested_at timestamptz, -- when the reader last asked
  kind text check (kind in ('monthly', 'refresh')), -- monthly re-predicts ratings; a weekly refresh doesn't
  started_at timestamptz,
  finished_at timestamptz,
  error text
);

alter table public.profile_requests enable row level security;

-- Readers can see their own row; the server writes with the service role
create policy "Readers read their own profile requests" on public.profile_requests
  for select to authenticated using (user_id = auth.uid());
