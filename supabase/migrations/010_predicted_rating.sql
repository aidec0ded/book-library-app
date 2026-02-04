-- Phase 13: Predicted Ratings (replaces transformative_potential + canon_potential)

ALTER TABLE books ADD COLUMN predicted_rating numeric
  CHECK (predicted_rating >= 0.5 AND predicted_rating <= 5);

ALTER TABLE books ADD COLUMN predicted_at timestamptz;

ALTER TABLE books DROP COLUMN transformative_potential;
ALTER TABLE books DROP COLUMN canon_potential;
