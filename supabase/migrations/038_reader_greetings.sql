-- The home page greetings a reader was shown (server/greeting-handler.ts). The latest is
-- reused for an hour, across server restarts; the few before it are shown to the AI so a
-- new greeting doesn't repeat what recent ones said.
create table public.reader_greetings (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  greeting text not null,
  created_at timestamptz not null default now()
);

create index reader_greetings_user on public.reader_greetings (user_id, created_at desc);

alter table public.reader_greetings enable row level security;

create policy "Readers read their own greetings" on public.reader_greetings
  for select to authenticated using (user_id = auth.uid());

create policy "Readers add their own greetings" on public.reader_greetings
  for insert to authenticated with check (user_id = auth.uid());
