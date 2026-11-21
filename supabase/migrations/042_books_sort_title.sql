-- Titles sort the way shelves and catalogs file them: a leading "A", "An", or "The" is
-- skipped, so A Clash of Kings files under C, and so is leading punctuation, so 'Salem's
-- Lot files under S. The title itself is unchanged; this is only the key to order by.
-- src/lib/sort-title.ts does the same in the browser.

alter table public.books
  add column sort_title text generated always as (
    regexp_replace(
      regexp_replace(
        regexp_replace(title, '^[^[:alnum:]]+', ''),
        '^(the|an?)\s+', '', 'i'
      ),
      '^[^[:alnum:]]+', ''
    )
  ) stored;

create index books_user_sort_title_idx on public.books (user_id, sort_title);
