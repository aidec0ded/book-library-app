-- Add ISBNdb enrichment columns to books
ALTER TABLE books ADD COLUMN page_count integer;
ALTER TABLE books ADD COLUMN publisher text;
ALTER TABLE books ADD COLUMN publication_year integer;
ALTER TABLE books ADD COLUMN format text;
ALTER TABLE books ADD COLUMN isbndb_enriched_at timestamptz;

-- Partial index for enrichment script: find books with ISBNs not yet enriched
CREATE INDEX idx_books_isbn_not_enriched
  ON books (title)
  WHERE isbn IS NOT NULL AND isbndb_enriched_at IS NULL;
