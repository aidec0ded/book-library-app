-- Personal release scores are now on request. A reader asks for curation on the
-- Releases page, and from then on the releases scheduler gives them personal scores
-- for each new month's notable releases (general score 6 or more) while they keep
-- visiting Releases. Before this, every reader with a recent profile had every
-- release scored, whether or not they ever opened the page.
--
-- requested_at: when the reader asked for curation
-- last_visited_at: when they last opened Releases; curation pauses after 60 days away
--
-- The server writes requests with the service role; readers can read their own row
-- and update it to record a visit.

CREATE TABLE IF NOT EXISTS release_curation (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  requested_at    timestamptz NOT NULL DEFAULT now(),
  last_visited_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE release_curation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own data" ON release_curation
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users update own data" ON release_curation
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Readers who already have personal scores keep curation, counting their last
-- sign-in as their last visit, so readers who have gone quiet stay paused
INSERT INTO release_curation (user_id, requested_at, last_visited_at)
SELECT s.user_id, now(), coalesce(u.last_sign_in_at, now())
FROM (SELECT DISTINCT user_id FROM user_release_scores WHERE personal_score IS NOT NULL) s
JOIN auth.users u ON u.id = s.user_id
ON CONFLICT (user_id) DO NOTHING;
