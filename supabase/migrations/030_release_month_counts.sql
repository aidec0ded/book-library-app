-- The Releases page's month menu counted releases by downloading every row of
-- new_releases (about 60,000, some 30 requests) on each visit, and its counts
-- included releases triage had dropped. This counts in the database instead: for
-- each month, how many notable releases the Notable view lists.
--
-- min_general: the general score a release needs to be notable (NOTABLE_MIN_GENERAL
-- in src/lib/release-scoring.ts)

CREATE OR REPLACE FUNCTION release_month_counts(min_general numeric)
RETURNS TABLE (pub_year integer, pub_month integer, notable bigint)
LANGUAGE sql STABLE
AS $$
  SELECT r.pub_year, r.pub_month,
         count(*) FILTER (WHERE r.skip_reason IS NULL AND r.general_signal_score >= min_general)
  FROM new_releases r
  WHERE r.pub_year IS NOT NULL AND r.pub_month IS NOT NULL
  GROUP BY r.pub_year, r.pub_month
  ORDER BY r.pub_year, r.pub_month
$$;

GRANT EXECUTE ON FUNCTION release_month_counts(numeric) TO authenticated;

-- Lets the count above, and the Notable list (a month's releases by general score),
-- read a small index rather than the whole table, which is mostly synopses
CREATE INDEX IF NOT EXISTS idx_new_releases_month_general
  ON new_releases (pub_year, pub_month, general_signal_score)
  INCLUDE (skip_reason);
