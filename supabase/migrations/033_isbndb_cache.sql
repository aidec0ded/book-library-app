-- A shared cache of ISBNdb's book data, and the latest ISBNdb quota figure
-- (server/isbndb.ts).
--
-- ISBNdb's plan allows 5,000 calls a day, and a lookup is charged per ISBN, bulk or
-- not. Every book ISBNdb returns (lookups, bulk lookups, and the results of searches)
-- is kept here by ISBN, and lookups check here first, so a book any reader has
-- brought in costs nothing for the next. It holds ISBNdb's own data, never readers'
-- books, which readers can edit. Releases already ingested are read from
-- new_releases rather than copied here.
--
-- Only the server's service role reads or writes these tables.

create table public.isbndb_books (
  isbn text primary key,            -- ISBN-13 when ISBNdb gives one, otherwise ISBN-10
  isbn10 text,
  data jsonb,                       -- ISBNdb's book object; null means looked up and not found
  fetched_at timestamptz not null default now()
);

create index idx_isbndb_books_isbn10 on public.isbndb_books (isbn10) where isbn10 is not null;

alter table public.isbndb_books enable row level security;

-- One row per paid API: what ISBNdb reported was left of today's quota, and when it resets
create table public.api_quota (
  service text primary key,
  remaining integer not null,
  resets_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.api_quota enable row level security;
