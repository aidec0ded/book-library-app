-- New releases are triaged before they're scored. scripts/triage-releases.ts drops
-- what isn't a new book for adult readers (audio and board books, academic and
-- textbook publishers, activity books, reprints, another format of the same book)
-- and records why, so only the rest is sent to the scorer. Releases with a skip
-- reason are hidden on the Releases page.
--
-- triaged_at: when the release was triaged; null means not yet, and it isn't scored
-- skip_reason: why it was dropped; null means it goes on to scoring

ALTER TABLE new_releases
  ADD COLUMN IF NOT EXISTS triaged_at timestamptz,
  ADD COLUMN IF NOT EXISTS skip_reason text;
