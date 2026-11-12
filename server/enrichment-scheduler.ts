import { runScript } from "./jobs.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STARTUP_DELAY_MS = 60 * 1000; // 1 minute after server start

// Stages run one at a time: each script is its own `npx tsx` process (~80-100MB),
// and running them concurrently alongside the server exceeded the 512MB instance
// limit. A single cycle lock also keeps a slow cycle from overlapping the next tick.
let cycleInFlight = false;

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
    console.log("[enrichment] Previous cycle still running, skipping.");
    return;
  }
  cycleInFlight = true;

  try {
    // Stage 0: ISBN discovery — books without ISBN that haven't been searched yet
    // (e.g. books added via chat's manage_book tool)
    const { count: discoveryPending } = await supabase
      .from("books")
      .select("id", { count: "exact", head: true })
      .is("isbn", null)
      .is("isbndb_enriched_at", null);

    if ((discoveryPending ?? 0) > 0) {
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

    if ((isbndbPending ?? 0) > 0) {
      await run(
        `ISBNdb enrichment (${isbndbPending} pending)`,
        "npx tsx scripts/enrich-isbndb.ts --limit 30",
      );
    }

    // Stage 2: Vibe tagging — fiction books without canonical vibes
    const untaggedFiction = await countUntagged(supabase, "fiction");

    if (untaggedFiction > 0) {
      await run(
        `Vibe tagging (${untaggedFiction} pending)`,
        "npx tsx scripts/tag-vibes.ts --limit 10",
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
        "npx tsx scripts/tag-classifications.ts --limit 10",
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
          `npx tsx scripts/predict-ratings.ts --user-id ${uid} --limit 20`,
        );
        break; // one user per cycle; the 5-min loop covers the rest
      }
    }
  } catch (err) {
    console.error(
      "[enrichment] Cycle error:",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    cycleInFlight = false;
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
