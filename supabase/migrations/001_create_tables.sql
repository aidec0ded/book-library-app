-- MoodLib: books + book_vibes schema

-- Books table
CREATE TABLE books (
  id                      uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title                   text NOT NULL,
  subtitle                text,
  series                  text,
  volume                  text,
  author                  text NOT NULL,
  isbn                    text,
  google_volume_id        text,
  genre                   text,
  summary                 text,
  category                text,
  status                  text,
  date_started            date,
  date_finished           date,
  rating                  numeric CHECK (rating >= 0 AND rating <= 5),
  is_favorite             boolean DEFAULT false,
  is_up_next              boolean DEFAULT false,
  notes                   text,
  cover_image_url         text,
  timing_month            integer CHECK (timing_month >= 1 AND timing_month <= 12),
  timing_position         text CHECK (timing_position IN ('early', 'mid', 'late')),
  timing_raw              text,
  transformative_potential text,
  canon_potential         text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- Book vibes table (starts empty, populated later by AI or user)
CREATE TABLE book_vibes (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id        uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  vibe           text NOT NULL,
  ai_assigned    boolean DEFAULT false,
  user_confirmed boolean DEFAULT false
);

-- Indexes
CREATE INDEX idx_books_title_author ON books (title, author);
CREATE INDEX idx_books_status ON books (status);
CREATE INDEX idx_books_timing_month ON books (timing_month);
CREATE INDEX idx_book_vibes_book_id ON book_vibes (book_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON books
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
