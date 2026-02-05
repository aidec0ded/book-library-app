-- Phase 17: Personalized New Release Filtering

ALTER TABLE new_releases ADD COLUMN general_signal_score numeric
  CHECK (general_signal_score >= 1 AND general_signal_score <= 10);

ALTER TABLE new_releases ADD COLUMN personal_score numeric
  CHECK (personal_score >= 1 AND personal_score <= 10);

ALTER TABLE new_releases ADD COLUMN ai_score numeric
  CHECK (ai_score >= 1 AND ai_score <= 10);

ALTER TABLE new_releases ADD COLUMN ai_rationale text;
ALTER TABLE new_releases ADD COLUMN scored_at timestamptz;
ALTER TABLE new_releases ADD COLUMN dismissed boolean NOT NULL DEFAULT false;

CREATE INDEX idx_new_releases_ai_score ON new_releases (pub_year, pub_month, ai_score DESC NULLS LAST);
