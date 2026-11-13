import { backgroundBudget } from "./isbndb.js";
import { runScript } from "./jobs.js";
import { recordJobRun } from "./usage.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STARTUP_DELAY_MS = 60 * 1000; // 1 minute after server start

// Stages run one at a time: each script is its own `npx tsx` process (~80-100MB),
// and running them concurrently alongside the server exceeded the 512MB instance
// limit. A single cycle lock also keeps a slow cycle from overlapping the next tick.
let cycleInFlight = false;
let cycleStartedAt = 0;

// Tagging and predictions go through the Message Batches API (half price), and a cycle
// waits for each batch, which usually takes minutes but can take up to an hour before
// the script cancels it. A cycle running longer than this is reported as stuck.
const CYCLE_STUCK_MS = 4 * 60 * 60 * 1000;

// When background ISBNdb calls have used their share of the day, lookups can still be
// filled from the shared cache, so enrichment runs, but only hourly until the reset
const QUOTA_WAIT_INTERVAL_MS = 60 * 60 * 1000;
let lastRunWithoutQuota = 0;

function run(label: string, command: string): Promise<void> {
  console.log(`[enrichment] Spawning: ${command}`);
  return new Promise((resolve) => {
    runScript(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`[enrichment] ${label} failed:`, error.message);
        if (stderr) console.error(`[enrichment] ${label} stderr:`, stderr);
        resolve();
        return;
      }
      // Only log if there was meaningful output (not just "No books to..." messages)
      const trimmed = stdout.trim();
      if (trimmed && !trimmed.endsWith("No books to enrich.") &&
          !trimmed.endsWith("No books to tag.") &&
          !trimmed.endsWith("No books to predict.") &&
          !trimmed.endsWith("No nonfiction books to tag.") &&
          !trimmed.endsWith("No poetry books to tag.") &&
          !trimmed.endsWith("No books without ISBNs found.")) {
        console.log(`[enrichment] ${label} output:\n${trimmed}`);
      }
      resolve();
    });
  });
}

/** Books of a type with no AI tag in these categories (any category if omitted), the same books the tagging scripts pick up. */
async function countUntagged(
  supabase: SupabaseClient,
  bookType: string,
  categories?: string[],
): Promise<number> {
  let query = supabase
    .from("books")
    .select("id, book_vibes!left(book_id)", { count: "exact", head: true })
    .eq("book_type", bookType)
    .eq("book_vibes.ai_assigned", true)
    .eq("book_vibes.is_canonical", true);
  if (categories) query = query.in("book_vibes.tag_category", categories);

  const { count, error } = await query.is("book_vibes", null);
  if (error) {
    console.error(`[enrichment] Couldn't count untagged ${bookType} books:`, error.message);
    return 0;
  }
  return count ?? 0;
}

async function runEnrichmentCycle(supabase: SupabaseClient): Promise<void> {
  if (cycleInFlight) {
    const minutes = Math.round((Date.now() - cycleStartedAt) / 60000);
    console.log(`[enrichment] Previous cycle still running (${minutes}min), skipping.`);
    // A cycle waiting on a batch is still working, so the job isn't stalled
    void recordJobRun(
      "enrichment_check",
      Date.now() - cycleStartedAt < CYCLE_STUCK_MS
        ? { ok: true }
        : { ok: false, error: `A cycle has been running for ${minutes} minutes` },
    );
    return;
  }
  cycleInFlight = true;
  cycleStartedAt = Date.now();
  let failure: string | null = null;

  try {
    const isbndbBudget = await backgroundBudget().catch(() => Infinity);
    const quotaWaiting = isbndbBudget === 0;
    const runIsbndbStages = !quotaWaiting || Date.now() - lastRunWithoutQuota >= QUOTA_WAIT_INTERVAL_MS;
    if (quotaWaiting && runIsbndbStages) lastRunWithoutQuota = Date.now();

    // Stage 0: ISBN discovery — books without ISBN that haven't been searched yet
    // (e.g. books added via chat's manage_book tool). Every search costs a call.
    const { count: discoveryPending } = await supabase
      .from("books")
      .select("id", { count: "exact", head: true })
      .is("isbn", null)
      .is("isbndb_enriched_at", null);

    if ((discoveryPending ?? 0) > 0 && !quotaWaiting) {
      await run(
        `ISBN discovery (${discoveryPending} pending)`,
        "npx tsx scripts/discover-isbns.ts --auto --limit 10",
      );
    }

    // Stage 1: ISBNdb enrichment — books with ISBN but not yet enriched
    const { count: isbndbPending } = await supabase
      .from("books")
      .select("id", { count: "exact", head: true })
      .not("isbn", "is", null)
      .is("isbndb_enriched_at", null);

    if ((isbndbPending ?? 0) > 0 && runIsbndbStages) {
      // Bulk lookups (100 ISBNs a call) make a large batch quick; the cost is per ISBN either way
      await run(
        `ISBNdb enrichment (${isbndbPending} pending)`,
        "npx tsx scripts/enrich-isbndb.ts --limit 500",
      );
    }

    // Stage 2: Vibe tagging — fiction books without canonical vibes
    const untaggedFiction = await countUntagged(supabase, "fiction");

    if (untaggedFiction > 0) {
      await run(
        `Vibe tagging (${untaggedFiction} pending)`,
        "npx tsx scripts/tag-vibes.ts --batch --limit 500",
      );
    }

    // Stage 3: Classification tagging — nonfiction/poetry without classifications
    const untaggedNonfiction = await countUntagged(supabase, "nonfiction", [
      "topic",
      "form",
      "depth",
    ]);
    const untaggedPoetry = await countUntagged(supabase, "poetry", [
      "movement",
      "formal_feel",
      "accessibility",
    ]);

    if (untaggedNonfiction > 0 || untaggedPoetry > 0) {
      await run(
        `Classification tagging (${untaggedNonfiction + untaggedPoetry} pending)`,
        "npx tsx scripts/tag-classifications.ts --batch --limit 500",
      );
    }

    // Stage 4: Predicted ratings — per user, unread books without predictions
    // (requires a profile + enough rated books). Predictions are user-scoped:
    // each user's books are predicted from their own profile and calibration,
    // so we find one user with pending work per cycle and spawn for just them.
    const { data: profileRows } = await supabase
      .from("reader_profile")
      .select("user_id")
      .order("generated_at", { ascending: false });

    // Deduplicate — a user may have multiple profile generations
    const profileUserIds = [...new Set((profileRows ?? []).map((r) => r.user_id))];

    for (const uid of profileUserIds) {
      const { count: ratedCount } = await supabase
        .from("books")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .gt("rating", 0);

      if ((ratedCount ?? 0) < 10) continue;

      const { count: unpredicted } = await supabase
        .from("books")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .or("status.eq.unread,status.is.null")
        .is("predicted_at", null);

      if ((unpredicted ?? 0) > 0) {
        await run(
          `Predicted ratings (${unpredicted} pending, user ${uid.slice(0, 8)}...)`,
          `npx tsx scripts/predict-ratings.ts --user-id ${uid} --batch --limit 500`,
        );
        break; // one reader per cycle; the next cycle takes the next reader
      }
    }
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
    console.error(
      "[enrichment] Cycle error:",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    cycleInFlight = false;
    void recordJobRun("enrichment_check", failure ? { ok: false, error: failure } : { ok: true });
  }
}

export function startEnrichmentScheduler(supabase: SupabaseClient): void {
  console.log(
    `[enrichment] Will check in ${STARTUP_DELAY_MS / 1000}s, then every ${CHECK_INTERVAL_MS / 60000}min.`,
  );

  // Initial check after startup delay
  setTimeout(() => {
    void runEnrichmentCycle(supabase);
  }, STARTUP_DELAY_MS);

  // Recurring check
  setInterval(() => {
    void runEnrichmentCycle(supabase);
  }, CHECK_INTERVAL_MS);
}
