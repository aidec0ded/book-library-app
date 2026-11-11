-- Embeddings for searching the library by meaning (Voyage voyage-4, 1024 dimensions).
--
-- text_embeddings holds one vector per distinct text, keyed by a hash of the text and
-- model, so a book in many readers' libraries is embedded once. It holds no text and
-- no reader, only vectors. book_embeddings links each library book to the vector of
-- its current text; the server's embedding job fills it, and the trigger below clears
-- a book's link when its text changes, so the job embeds it again.

create extension if not exists vector with schema extensions;

create table public.text_embeddings (
  content_hash text primary key,
  embedding extensions.halfvec(1024) not null,
  model text not null,
  created_at timestamptz not null default now()
);

alter table public.text_embeddings enable row level security;

-- Vectors alone reveal nothing readable, and search needs them for the reader's books
create policy "Signed-in readers can read embeddings"
  on public.text_embeddings for select to authenticated using (true);

create table public.book_embeddings (
  book_id uuid primary key references public.books (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  content_hash text not null references public.text_embeddings (content_hash),
  embedded_at timestamptz not null default now()
);

create index idx_book_embeddings_user on public.book_embeddings (user_id);

alter table public.book_embeddings enable row level security;

create policy "Readers can read their own book embeddings"
  on public.book_embeddings for select to authenticated using (user_id = auth.uid());

-- Writes to both tables come from the server's service role only.

-- When the text a book's embedding is based on changes, drop its link so it's embedded again
create or replace function public.clear_book_embedding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.book_embeddings where book_id = new.id;
  return new;
end;
$$;

create trigger clear_book_embedding_on_text_change
  after update of title, subtitle, author, genre, summary, book_type on public.books
  for each row
  when (
    old.title is distinct from new.title
    or old.subtitle is distinct from new.subtitle
    or old.author is distinct from new.author
    or old.genre is distinct from new.genre
    or old.summary is distinct from new.summary
    or old.book_type is distinct from new.book_type
  )
  execute function public.clear_book_embedding();

-- The reader's books closest in meaning to a search, or to one of their books.
-- Runs as the caller, so row-level security keeps it to the reader's own books.
-- Give query_embedding for a described search, or like_book_id for "books like this one".
create or replace function public.match_books(
  query_embedding extensions.halfvec(1024) default null,
  like_book_id uuid default null,
  statuses text[] default null,
  only_type text default null,
  match_count int default 25
)
returns table (book_id uuid, similarity double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with target as (
    select coalesce(
      query_embedding,
      (select te.embedding
         from book_embeddings be
         join text_embeddings te on te.content_hash = be.content_hash
        where be.book_id = like_book_id)
    ) as embedding
  )
  select b.id, 1 - (te.embedding <=> target.embedding) as similarity
  from target
  join book_embeddings be on true
  join books b on b.id = be.book_id
  join text_embeddings te on te.content_hash = be.content_hash
  where target.embedding is not null
    and (like_book_id is null or b.id <> like_book_id)
    and (statuses is null or b.status = any (statuses))
    and (only_type is null or b.book_type = only_type)
  order by te.embedding <=> target.embedding
  limit least(greatest(match_count, 1), 200);
$$;

grant execute on function public.match_books(extensions.halfvec, uuid, text[], text, int) to authenticated;
