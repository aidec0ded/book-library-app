-- Allow anonymous inserts (personal app, no auth)
CREATE POLICY "Allow anonymous inserts"
  ON book_vibes FOR INSERT WITH CHECK (true);

-- Allow anonymous deletes
CREATE POLICY "Allow anonymous deletes"
  ON book_vibes FOR DELETE USING (true);

-- Prevent duplicate vibes on the same book
ALTER TABLE book_vibes
  ADD CONSTRAINT unique_book_vibe UNIQUE (book_id, vibe);

-- Index for autocomplete and future vibe filtering
CREATE INDEX idx_book_vibes_vibe ON book_vibes (vibe);
