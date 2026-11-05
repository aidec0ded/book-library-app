import { exec } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SCORABLE_RELEASES } from "../src/lib/release-scoring.js";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const STARTUP_DELAY_MS = 2 * 60 * 1000; // 2 minutes after server start
const TRIGGER_DAY = 25; // Day of month to start targeting next month
// Readers get personal release scores while their profile is recent. Profiles only
// regenerate after reading activity, so an older one means the reader has gone quiet,
// and scoring a whole month of releases for them would be wasted.
const ACTIVE_PROFILE_DAYS = 90;

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
function getTargetMonths(now: Date): { year: number; month: number; label: string }[] {
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

export interface ReleasesJob {
  label: string;
  command: string;
  guard: keyof typeof inFlight;
}

function monthReleases(supabase: SupabaseClient, year: number, month: number) {
  return supabase
    .from("new_releases")
    .select("id", { count: "exact", head: true })
    .eq("pub_year", year)
    .eq("pub_month", month);
}

/**
 * The next job the releases pipeline needs, or null when every target month is
 * imported and scored for every reader with a profile. Reads only; spawns nothing.
 *
 * Imports come first: any target month with no releases is imported, so unfinished
 * scoring never holds up next month. Then, per month: score releases with no general
 * score, then give personal scores to each reader whose profile is recent
 * (ACTIVE_PROFILE_DAYS). Releases with nothing to judge (no synopsis or subjects)
 * are left out of every count, as the scorer leaves them out.
 */
export async function planReleasesJob(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<ReleasesJob | null> {
  const targets = getTargetMonths(now);
  console.log(`[releases] Checking ${targets.map((t) => t.label).join(", ")}...`);

  // Readers with a recent profile, most recently generated first
  const activeSince = new Date(now.getTime() - ACTIVE_PROFILE_DAYS * 24 * 60 * 60 * 1000);
  const { data: profiles, error: profilesError } = await supabase
    .from("reader_profile")
    .select("user_id")
    .gte("generated_at", activeSince.toISOString())
    .order("generated_at", { ascending: false });
  if (profilesError) throw new Error(`reader_profile: ${profilesError.message}`);
  const profileUserIds = [...new Set((profiles ?? []).map((p) => p.user_id as string))];

  // Imports first, for every target month, so unfinished scoring never holds up next month
  for (const { year, month, label } of targets) {
    const { count: totalReleases } = await monthReleases(supabase, year, month);
    if ((totalReleases ?? 0) === 0) {
      return {
        label: `Ingestion for ${label}`,
        command: `npx tsx scripts/ingest-releases.ts --month ${label} --language en`,
        guard: "ingestion",
      };
    }
  }

  for (const { year, month, label } of targets) {
    const { count: unscored } = await monthReleases(supabase, year, month)
      .or(SCORABLE_RELEASES)
      .is("general_signal_score", null);

    if ((unscored ?? 0) > 0) {
      // General and personal scores together, for the reader with the newest profile
      const userIdFlag = profileUserIds[0] ? ` --user-id ${profileUserIds[0]}` : "";
      return {
        label: `Scoring for ${label} (${unscored} unscored)`,
        command: `npx tsx scripts/score-releases.ts --month ${label} --batch${userIdFlag}`,
        guard: "scoring",
      };
    }

    const { count: scored } = await monthReleases(supabase, year, month)
      .or(SCORABLE_RELEASES)
      .not("general_signal_score", "is", null);

    for (const uid of profileUserIds) {
      const { count: userScores, error } = await supabase
        .from("user_release_scores")
        .select("release_id, new_releases!inner(id)", { count: "exact", head: true })
        .eq("user_id", uid)
        .not("personal_score", "is", null)
        .eq("new_releases.pub_year", year)
        .eq("new_releases.pub_month", month)
        .or(SCORABLE_RELEASES, { referencedTable: "new_releases" });
      if (error) throw new Error(`user_release_scores: ${error.message}`);

      const missing = (scored ?? 0) - (userScores ?? 0);
      if (missing > 0) {
        return {
          label: `Personal scoring for ${label} (${missing} releases, user ${uid.slice(0, 8)}...)`,
          command: `npx tsx scripts/score-releases.ts --month ${label} --batch --user-id ${uid}`,
          guard: "scoring",
        };
      }
    }
  }

  return null;
}

async function runReleasesCheck(supabase: SupabaseClient): Promise<void> {
  try {
    if (inFlight.ingestion || inFlight.scoring) {
      console.log("[releases] A releases job is still running, skipping this check.");
      return;
    }
    const job = await planReleasesJob(supabase);
    if (job) {
      spawn(job.label, job.command, job.guard);
    } else {
      console.log("[releases] All months covered, nothing to do.");
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
