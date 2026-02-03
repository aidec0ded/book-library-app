-- Add is_canonical flag to book_vibes
ALTER TABLE book_vibes ADD COLUMN is_canonical boolean DEFAULT false;

-- Index for vibe grid counts: quickly count books per canonical vibe
CREATE INDEX idx_book_vibes_canonical_vibe
  ON book_vibes (vibe)
  WHERE is_canonical = true;

-- Index for per-book canonical lookups
CREATE INDEX idx_book_vibes_book_canonical
  ON book_vibes (book_id)
  WHERE is_canonical = true;
