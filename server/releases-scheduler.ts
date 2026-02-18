import { exec } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const STARTUP_DELAY_MS = 2 * 60 * 1000; // 2 minutes after server start
const TRIGGER_DAY = 25; // Day of month to start targeting next month

const inFlight = {
  ingestion: false,
  scoring: false,
};

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Determine which months need coverage:
 * - Always check that the current month has releases (safety net for fresh deploys)
 * - On day >= 25, also target next month (the primary trigger)
 */
function getTargetMonths(): { year: number; month: number; label: string }[] {
  const now = new Date();
  const targets: { year: number; month: number; label: string }[] = [];

  // Current month — ensure it's covered
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1; // 1-based
  targets.push({ year: curYear, month: curMonth, label: formatMonth(curYear, curMonth) });

  // Next month — only if we're on or past the trigger day
  if (now.getDate() >= TRIGGER_DAY) {
    const next = new Date(curYear, now.getMonth() + 1, 1);
    const nextYear = next.getFullYear();
    const nextMonth = next.getMonth() + 1;
    targets.push({ year: nextYear, month: nextMonth, label: formatMonth(nextYear, nextMonth) });
  }

  return targets;
}

function spawn(label: string, command: string, guard: keyof typeof inFlight): void {
  if (inFlight[guard]) {
    console.log(`[releases] ${label} already in flight, skipping.`);
    return;
  }
  inFlight[guard] = true;
  console.log(`[releases] Spawning: ${command}`);
  exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
    inFlight[guard] = false;
    if (error) {
      console.error(`[releases] ${label} failed:`, error.message);
      if (stderr) console.error(`[releases] ${label} stderr:`, stderr);
      return;
    }
    const trimmed = stdout.trim();
    if (trimmed) {
      console.log(`[releases] ${label} output:\n${trimmed}`);
    }
  });
}

async function runReleasesCheck(supabase: SupabaseClient): Promise<void> {
  try {
    const targets = getTargetMonths();

    for (const { year, month, label } of targets) {
      // Check how many releases exist for this month
      const { count: totalReleases } = await supabase
        .from("new_releases")
        .select("id", { count: "exact", head: true })
        .eq("pub_year", year)
        .eq("pub_month", month);

      if ((totalReleases ?? 0) === 0) {
        // No releases for this month — ingest
        spawn(
          `Ingestion for ${label}`,
          `npx tsx scripts/ingest-releases.ts --month ${label} --language en`,
          "ingestion",
        );
        // Don't try to score this month until next cycle (ingestion needs to finish first)
        continue;
      }

      // Releases exist — check if scoring is needed
      if (!inFlight.ingestion && !inFlight.scoring) {
        // Look up a user with a reader profile for personal scoring
        const { data: profileUser } = await supabase
          .from("reader_profile")
          .select("user_id")
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const userIdFlag = profileUser ? ` --user-id ${profileUser.user_id}` : "";

        // Check 1: General signal scoring (shared, runs once)
        const { count: unscoredCount } = await supabase
          .from("new_releases")
          .select("id", { count: "exact", head: true })
          .eq("pub_year", year)
          .eq("pub_month", month)
          .is("general_signal_score", null);

        if ((unscoredCount ?? 0) > 0) {
          spawn(
            `Scoring for ${label} (${unscoredCount} unscored)`,
            `npx tsx scripts/score-releases.ts --month ${label} --batch${userIdFlag}`,
            "scoring",
          );
          break;
        }

        // Check 2: Personal scoring — general scores exist but user has no personal scores
        if (profileUser) {
          const { count: scoredReleases } = await supabase
            .from("new_releases")
            .select("id", { count: "exact", head: true })
            .eq("pub_year", year)
            .eq("pub_month", month)
            .not("general_signal_score", "is", null);

          const { count: userScores } = await supabase
            .from("user_release_scores")
            .select("id", { count: "exact", head: true })
            .eq("user_id", profileUser.user_id);

          if ((scoredReleases ?? 0) > 0 && (userScores ?? 0) === 0) {
            spawn(
              `Personal scoring for ${label} (${scoredReleases} releases, user ${profileUser.user_id.slice(0, 8)}...)`,
              `npx tsx scripts/score-releases.ts --month ${label} --batch --force${userIdFlag}`,
              "scoring",
            );
            break;
          }
        }
      }
    }
  } catch (err) {
    console.error(
      "[releases] Check error:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

export function startReleasesScheduler(supabase: SupabaseClient): void {
  console.log(
    `[releases] Will check in ${STARTUP_DELAY_MS / 1000}s, then every ${CHECK_INTERVAL_MS / 3600000}h. Ingests next month on day ${TRIGGER_DAY}+.`,
  );

  setTimeout(() => {
    void runReleasesCheck(supabase);
  }, STARTUP_DELAY_MS);

  setInterval(() => {
    void runReleasesCheck(supabase);
  }, CHECK_INTERVAL_MS);
}
