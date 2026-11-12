import { runScript } from "./jobs.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { personallyScorableOnly, scorableOnly } from "../src/lib/release-scoring.js";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const STARTUP_DELAY_MS = 2 * 60 * 1000; // 2 minutes after server start
const TRIGGER_DAY = 25; // Day of month to start targeting next month
// Readers get personal release scores only after asking for curation on the Releases
// page, and only while they keep visiting it. Scoring a month for a reader who has
// stopped looking would be wasted.
const CURATION_ACTIVE_DAYS = 60;
// After a job finishes, the next one starts right away rather than at the next
// 4-hourly check, so a reader's curation request doesn't wait behind other work.
// Capped, so a job that somehow makes no progress can't run back to back forever.
const CHAIN_DELAY_MS = 5_000;
const MAX_CHAINED_JOBS = 12;

const inFlight = {
  ingestion: false,
  triage: false,
  scoring: false,
};
let chainedJobs = 0;
let checkRequested = false;
let schedulerSupabase: SupabaseClient | null = null;

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
  runScript(command, (error, stdout, stderr) => {
    inFlight[guard] = false;
    if (error) {
      console.error(`[releases] ${label} failed:`, error.message);
      if (stderr) console.error(`[releases] ${label} stderr:`, stderr);
    } else {
      const trimmed = stdout.trim();
      if (trimmed) {
        console.log(`[releases] ${label} output:\n${trimmed}`);
      }
    }
    // Go on to the next job now: after a success, or when a reader asked while this ran
    const requested = checkRequested;
    checkRequested = false;
    if ((!error || requested) && chainedJobs < MAX_CHAINED_JOBS && schedulerSupabase) {
      chainedJobs++;
      const supabase = schedulerSupabase;
      setTimeout(() => void runReleasesCheck(supabase), CHAIN_DELAY_MS);
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
 * Readers to curate releases for: they asked on the Releases page, visited it in the
 * last CURATION_ACTIVE_DAYS, and have a reader profile to score against. Most
 * recent visitor first, so a reader who just asked goes first.
 */
async function curatingReaders(supabase: SupabaseClient, now: Date): Promise<string[]> {
  const activeSince = new Date(now.getTime() - CURATION_ACTIVE_DAYS * 24 * 60 * 60 * 1000);
  const { data: curation, error } = await supabase
    .from("release_curation")
    .select("user_id")
    .gte("last_visited_at", activeSince.toISOString())
    .order("last_visited_at", { ascending: false });
  if (error) throw new Error(`release_curation: ${error.message}`);
  const ids = (curation ?? []).map((r) => r.user_id as string);
  if (ids.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("reader_profile")
    .select("user_id")
    .in("user_id", ids);
  if (profilesError) throw new Error(`reader_profile: ${profilesError.message}`);
  const withProfile = new Set((profiles ?? []).map((p) => p.user_id as string));
  return ids.filter((id) => withProfile.has(id));
}

/**
 * The next job the releases pipeline needs, or null when every target month is
 * imported, scored, and curated. Reads only; spawns nothing.
 *
 * Imports come first: any target month with no releases is imported, so unfinished
 * scoring never holds up next month. Then, per month: triage releases not yet
 * triaged; give general scores to kept releases with none; then give personal scores
 * on notable releases to each curating reader. Counts use the same filters as the
 * scorer (scorableOnly, personallyScorableOnly), so they agree on what's left to do.
 */
export async function planReleasesJob(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<ReleasesJob | null> {
  const targets = getTargetMonths(now);
  console.log(`[releases] Checking ${targets.map((t) => t.label).join(", ")}...`);

  const readers = await curatingReaders(supabase, now);

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
    // Triage before scoring, so only new books for adult readers get scored
    const { count: untriaged } = await monthReleases(supabase, year, month).is("triaged_at", null);
    if ((untriaged ?? 0) > 0) {
      return {
        label: `Triage for ${label} (${untriaged} releases)`,
        command: `npx tsx scripts/triage-releases.ts --month ${label}`,
        guard: "triage",
      };
    }

    const { count: unscored } = await scorableOnly(monthReleases(supabase, year, month))
      .is("general_signal_score", null);

    if ((unscored ?? 0) > 0) {
      return {
        label: `General scoring for ${label} (${unscored} unscored)`,
        command: `npx tsx scripts/score-releases.ts --month ${label} --batch`,
        guard: "scoring",
      };
    }

    if (readers.length === 0) continue;
    const { count: notable } = await personallyScorableOnly(monthReleases(supabase, year, month));

    for (const uid of readers) {
      const { count: userScores, error } = await personallyScorableOnly(
        supabase
          .from("user_release_scores")
          .select("release_id, new_releases!inner(id)", { count: "exact", head: true })
          .eq("user_id", uid)
          .not("personal_score", "is", null)
          .eq("new_releases.pub_year", year)
          .eq("new_releases.pub_month", month),
        "new_releases",
      );
      if (error) throw new Error(`user_release_scores: ${error.message}`);

      const missing = (notable ?? 0) - (userScores ?? 0);
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

let planning = false;

async function runReleasesCheck(supabase: SupabaseClient): Promise<void> {
  // One job at a time: each is its own process of about 100MB on a 512MB server
  if (planning || inFlight.ingestion || inFlight.triage || inFlight.scoring) {
    console.log("[releases] A releases job is still running, skipping this check.");
    return;
  }
  planning = true;
  try {
    const job = await planReleasesJob(supabase);
    if (job) {
      spawn(job.label, job.command, job.guard);
    } else if (checkRequested) {
      // A reader asked while this check was reading: look again for their request
      checkRequested = false;
      setTimeout(() => void runReleasesCheck(supabase), CHAIN_DELAY_MS);
    } else {
      console.log("[releases] All months covered, nothing to do.");
    }
  } catch (err) {
    console.error(
      "[releases] Check error:",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    planning = false;
  }
}

/**
 * Check for work now, as when a reader asks for curation. If a job is running, the
 * check happens as soon as it finishes.
 */
export function requestReleasesCheck(): void {
  if (!schedulerSupabase) return;
  chainedJobs = 0;
  if (planning || inFlight.ingestion || inFlight.triage || inFlight.scoring) {
    checkRequested = true;
    return;
  }
  void runReleasesCheck(schedulerSupabase);
}

export function startReleasesScheduler(supabase: SupabaseClient): void {
  schedulerSupabase = supabase;
  console.log(
    `[releases] Will check in ${STARTUP_DELAY_MS / 1000}s, then every ${CHECK_INTERVAL_MS / 3600000}h. Ingests next month on day ${TRIGGER_DAY}+.`,
  );

  setTimeout(() => {
    void runReleasesCheck(supabase);
  }, STARTUP_DELAY_MS);

  setInterval(() => {
    chainedJobs = 0;
    void runReleasesCheck(supabase);
  }, CHECK_INTERVAL_MS);
}
