-- Add predicted_rationale column for AI-generated rating explanations

ALTER TABLE books ADD COLUMN predicted_rationale text;
