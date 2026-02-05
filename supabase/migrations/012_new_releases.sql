-- Phase 16: New Releases Ingestion

CREATE TABLE new_releases (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  isbn13          text NOT NULL UNIQUE,
  isbn10          text,
  title           text NOT NULL,
  authors         text[] NOT NULL DEFAULT '{}',
  publisher       text,
  date_published  text,
  pub_year        integer,
  pub_month       integer CHECK (pub_month >= 1 AND pub_month <= 12),
  cover_image_url text,
  synopsis        text,
  subjects        text[] NOT NULL DEFAULT '{}',
  binding         text,
  page_count      integer,
  language        text,
  edition         text,
  source          text NOT NULL DEFAULT 'isbndb',
  ingested_at     timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_new_releases_pub_month ON new_releases (pub_year, pub_month);
CREATE INDEX idx_new_releases_ingested_at ON new_releases (ingested_at DESC);

CREATE TRIGGER set_new_releases_updated_at
  BEFORE UPDATE ON new_releases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE new_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous reads" ON new_releases FOR SELECT USING (true);
CREATE POLICY "Allow anonymous inserts" ON new_releases FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous updates" ON new_releases FOR UPDATE USING (true);
CREATE POLICY "Allow anonymous deletes" ON new_releases FOR DELETE USING (true);
