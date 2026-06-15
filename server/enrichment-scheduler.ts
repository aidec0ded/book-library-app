import { exec } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STARTUP_DELAY_MS = 60 * 1000; // 1 minute after server start

// In-flight guards — one per enrichment stage
const inFlight = {
  discovery: false,
  isbndb: false,
  vibes: false,
  classifications: false,
  predictions: false,
};

function spawn(label: string, command: string, guard: keyof typeof inFlight): void {
  if (inFlight[guard]) {
    console.log(`[enrichment] ${label} already in flight, skipping.`);
    return;
  }
  inFlight[guard] = true;
  console.log(`[enrichment] Spawning: ${command}`);
  exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
    inFlight[guard] = false;
    if (error) {
      console.error(`[enrichment] ${label} failed:`, error.message);
      if (stderr) console.error(`[enrichment] ${label} stderr:`, stderr);
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
  });
}

async function runEnrichmentCycle(supabase: SupabaseClient): Promise<void> {
  try {
    // Stage 0: ISBN discovery — books without ISBN that haven't been searched yet
    // (e.g. books added via chat's manage_book tool)
    if (!inFlight.discovery) {
      const { count: discoveryPending } = await supabase
        .from("books")
        .select("id", { count: "exact", head: true })
        .is("isbn", null)
        .is("isbndb_enriched_at", null);

      if ((discoveryPending ?? 0) > 0) {
        spawn(
          `ISBN discovery (${discoveryPending} pending)`,
          "npx tsx scripts/discover-isbns.ts --auto --limit 10",
          "discovery",
        );
      }
    }

    // Stage 1: ISBNdb enrichment — books with ISBN but not yet enriched
    const { count: isbndbPending } = await supabase
      .from("books")
      .select("id", { count: "exact", head: true })
      .not("isbn", "is", null)
      .is("isbndb_enriched_at", null);

    if ((isbndbPending ?? 0) > 0) {
      spawn(
        `ISBNdb enrichment (${isbndbPending} pending)`,
        "npx tsx scripts/enrich-isbndb.ts --limit 30",
        "isbndb",
      );
    }

    // Stage 2: Vibe tagging — fiction books without canonical vibes
    // The script itself filters for fiction books without existing AI vibes
    if (!inFlight.vibes) {
      const { count: fictionCount } = await supabase
        .from("books")
        .select("id", { count: "exact", head: true })
        .eq("book_type", "fiction");

      const { count: taggedCount } = await supabase
        .from("book_vibes")
        .select("book_id", { count: "exact", head: true })
        .eq("ai_assigned", true)
        .eq("is_canonical", true)
        .eq("tag_category", "vibe");

      // Rough check: if fiction books > tagged books, there are untagged fiction books
      if ((fictionCount ?? 0) > (taggedCount ?? 0)) {
        spawn(
          "Vibe tagging",
          "npx tsx scripts/tag-vibes.ts --limit 10",
          "vibes",
        );
      }
    }

    // Stage 3: Classification tagging — nonfiction/poetry without classifications
    if (!inFlight.classifications) {
      // Check nonfiction
      const { count: nfCount } = await supabase
        .from("books")
        .select("id", { count: "exact", head: true })
        .eq("book_type", "nonfiction");

      const { count: nfTaggedCount } = await supabase
        .from("book_vibes")
        .select("book_id", { count: "exact", head: true })
        .eq("ai_assigned", true)
        .eq("is_canonical", true)
        .eq("tag_category", "topic");

      // Check poetry
      const { count: poetryCount } = await supabase
        .from("books")
        .select("id", { count: "exact", head: true })
        .eq("book_type", "poetry");

      const { count: poetryTaggedCount } = await supabase
        .from("book_vibes")
        .select("book_id", { count: "exact", head: true })
        .eq("ai_assigned", true)
        .eq("is_canonical", true)
        .eq("tag_category", "movement");

      const nfPending = (nfCount ?? 0) > (nfTaggedCount ?? 0);
      const poetryPending = (poetryCount ?? 0) > (poetryTaggedCount ?? 0);

      if (nfPending || poetryPending) {
        spawn(
          "Classification tagging",
          "npx tsx scripts/tag-classifications.ts --limit 10",
          "classifications",
        );
      }
    }

    // Stage 4: Predicted ratings — per user, unread books without predictions
    // (requires a profile + enough rated books). Predictions are user-scoped:
    // each user's books are predicted from their own profile and calibration,
    // so we find one user with pending work per cycle and spawn for just them.
    if (!inFlight.predictions) {
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
          spawn(
            `Predicted ratings (${unpredicted} pending, user ${uid.slice(0, 8)}...)`,
            `npx tsx scripts/predict-ratings.ts --user-id ${uid} --limit 20`,
            "predictions",
          );
          break; // one user per cycle; the 5-min loop covers the rest
        }
      }
    }
  } catch (err) {
    console.error(
      "[enrichment] Cycle error:",
      err instanceof Error ? err.message : String(err),
    );
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
