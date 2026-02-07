-- Add fiction/nonfiction classification to new_releases
ALTER TABLE new_releases ADD COLUMN is_fiction boolean;

-- Backfill based on subjects array
UPDATE new_releases
SET is_fiction = EXISTS (
  SELECT 1 FROM unnest(subjects) AS s
  WHERE s ~* '(fiction|novel|thriller|mystery|romance|fantasy|sci-fi|science fiction|horror|suspense|detective|adventure|comics & graphic novels|manga|graphic novels)'
)
WHERE subjects != '{}';

-- Index for filtered queries
CREATE INDEX idx_new_releases_is_fiction ON new_releases(is_fiction) WHERE is_fiction IS NOT NULL;
