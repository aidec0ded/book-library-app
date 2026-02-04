-- Phase 12: Reader Profile

CREATE TABLE reader_profile (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  generated_at        timestamptz NOT NULL DEFAULT now(),
  profile_data        jsonb NOT NULL,
  generation_context  jsonb,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_reader_profile_generated_at ON reader_profile (generated_at DESC);

-- RLS
ALTER TABLE reader_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous reads" ON reader_profile FOR SELECT USING (true);
CREATE POLICY "Allow anonymous inserts" ON reader_profile FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anonymous updates" ON reader_profile FOR UPDATE USING (true);
