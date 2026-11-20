-- Embeddings for new releases, so a book page can show "New releases like this" and a
-- release can show the reader's own books it's closest to. Same vectors and store as
-- books (migration 031): a release is embedded from the same kind of text, so the two
-- compare directly, and a text already embedded is shared. Only notable releases (a
-- general score of 6 or more, not dropped by triage) are embedded, by the server's job.

create table public.release_embeddings (
  release_id uuid primary key references public.new_releases (id) on delete cascade,
  content_hash text not null references public.text_embeddings (content_hash),
  embedded_at timestamptz not null default now()
);

alter table public.release_embeddings enable row level security;

-- Releases are the same for every reader
create policy "Signed-in readers can read release embeddings"
  on public.release_embeddings for select to authenticated using (true);

-- Writes come from the server's service role only.

-- When the text a release's embedding is based on changes, drop its link so it's embedded again
create or replace function public.clear_release_embedding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.release_embeddings where release_id = new.id;
  return new;
end;
$$;

create trigger clear_release_embedding_on_text_change
  after update of title, authors, synopsis, is_fiction on public.new_releases
  for each row
  when (
    old.title is distinct from new.title
    or old.authors is distinct from new.authors
    or old.synopsis is distinct from new.synopsis
    or old.is_fiction is distinct from new.is_fiction
  )
  execute function public.clear_release_embedding();

-- Notable releases closest to one of the reader's books, from a given month on
-- (year * 12 + month - 1), leaving out releases already in their library (by ISBN) and
-- ones they dismissed. Runs as the caller, so the book must be theirs.
create or replace function public.match_releases(
  like_book_id uuid,
  since_month int default null,
  match_count int default 12
)
returns table (release_id uuid, similarity double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with target as (
    select te.embedding
      from book_embeddings be
      join text_embeddings te on te.content_hash = be.content_hash
     where be.book_id = like_book_id
  ),
  -- The nearest few first, so the library and dismissal checks only run on those
  nearest as (
    select r.id, r.isbn13, r.isbn10, te.embedding <=> target.embedding as distance
    from target
    join release_embeddings re on true
    join new_releases r on r.id = re.release_id
    join text_embeddings te on te.content_hash = re.content_hash
    where r.skip_reason is null
      and r.general_signal_score >= 6
      and (since_month is null or r.pub_year * 12 + r.pub_month - 1 >= since_month)
    order by distance
    limit least(greatest(match_count, 1), 50) * 4
  )
  select n.id, 1 - n.distance as similarity
  from nearest n
  where not exists (
      select 1 from books b where b.isbn is not null and b.isbn in (n.isbn13, n.isbn10)
    )
    and not exists (
      select 1 from user_release_scores s
       where s.release_id = n.id and s.user_id = auth.uid() and s.dismissed
    )
  order by n.distance
  limit least(greatest(match_count, 1), 50);
$$;

grant execute on function public.match_releases(uuid, int, int) to authenticated;

-- The reader's books closest to a release, with the given statuses (default: read).
-- Runs as the caller, so it only looks at their own books.
create or replace function public.release_library_matches(
  for_release_id uuid,
  statuses text[] default array['read'],
  match_count int default 3
)
returns table (book_id uuid, similarity double precision)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with target as (
    select te.embedding
      from release_embeddings re
      join text_embeddings te on te.content_hash = re.content_hash
     where re.release_id = for_release_id
  )
  select b.id, 1 - (te.embedding <=> target.embedding) as similarity
  from target
  join book_embeddings be on true
  join books b on b.id = be.book_id
  join text_embeddings te on te.content_hash = be.content_hash
  where b.status = any (statuses)
  order by te.embedding <=> target.embedding
  limit least(greatest(match_count, 1), 20);
$$;

grant execute on function public.release_library_matches(uuid, text[], int) to authenticated;
