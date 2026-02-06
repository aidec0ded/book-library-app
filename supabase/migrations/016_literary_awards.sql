-- Literary awards reference table
CREATE TABLE literary_awards (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  short_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('fiction', 'nonfiction', 'poetry')),
  wikidata_id text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Award entries (winners + nominees, matched to library books)
CREATE TABLE award_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  award_id uuid NOT NULL REFERENCES literary_awards(id) ON DELETE CASCADE,
  book_id uuid REFERENCES books(id) ON DELETE SET NULL,
  title text NOT NULL,
  author text NOT NULL,
  year integer,
  status text NOT NULL CHECK (status IN ('winner', 'shortlist', 'longlist', 'nominee')),
  wikidata_work_id text,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_award_entries_book_id ON award_entries(book_id) WHERE book_id IS NOT NULL;
CREATE INDEX idx_award_entries_award_id ON award_entries(award_id);

-- RLS
ALTER TABLE literary_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE award_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read on literary_awards"
  ON literary_awards FOR SELECT USING (true);

CREATE POLICY "Allow anonymous read on award_entries"
  ON award_entries FOR SELECT USING (true);

-- Seed the 17 awards
INSERT INTO literary_awards (name, short_name, category, wikidata_id) VALUES
  ('Pulitzer Prize for Fiction', 'Pulitzer', 'fiction', 'Q833633'),
  ('Pulitzer Prize for General Nonfiction', 'Pulitzer NF', 'nonfiction', 'Q784589'),
  ('Pulitzer Prize for Poetry', 'Pulitzer Poetry', 'poetry', 'Q2117891'),
  ('National Book Award for Fiction', 'NBA Fiction', 'fiction', 'Q3873144'),
  ('National Book Award for Nonfiction', 'NBA Nonfiction', 'nonfiction', 'Q3873147'),
  ('National Book Award for Poetry', 'NBA Poetry', 'poetry', 'Q3873146'),
  ('Booker Prize', 'Booker', 'fiction', 'Q160082'),
  ('Women''s Prize for Fiction', 'Women''s Prize', 'fiction', 'Q18884'),
  ('Nebula Award for Best Novel', 'Nebula', 'fiction', 'Q266012'),
  ('National Book Critics Circle Award (Fiction)', 'NBCC', 'fiction', 'Q109554372'),
  ('PEN/Faulkner Award for Fiction', 'PEN/Faulkner', 'fiction', 'Q1188661'),
  ('Edgar Award for Best Novel', 'Edgar', 'fiction', 'Q113436830'),
  ('Kirkus Prize (Fiction)', 'Kirkus', 'fiction', 'Q104595214'),
  ('World Fantasy Award for Best Novel', 'World Fantasy', 'fiction', 'Q898527'),
  ('Shirley Jackson Award for Best Novel', 'Shirley Jackson', 'fiction', 'Q76628689'),
  ('Goldsmiths Prize', 'Goldsmiths', 'fiction', 'Q5580323'),
  ('The Story Prize', 'Story Prize', 'fiction', 'Q7766719');
