import { exec } from "node:child_process";
import type { SupabaseClient } from "@supabase/supabase-js";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const STARTUP_DELAY_MS = 30 * 1000; // 30 seconds after server start
const MIN_AGE_DAYS = 30;

interface ActivitySnapshot {
  total_books: number;
  books_read: number;
  books_reading_started: number;
  books_rated: number;
  books_with_notes: number;
  total_messages: number;
}

const THRESHOLDS: { key: keyof ActivitySnapshot; delta: number; label: string }[] = [
  { key: "total_books", delta: 5, label: "books added" },
  { key: "books_reading_started", delta: 5, label: "books started" },
  { key: "books_read", delta: 3, label: "books finished" },
  { key: "books_rated", delta: 3, label: "books rated" },
  { key: "books_with_notes", delta: 3, label: "books with new notes" },
  { key: "total_messages", delta: 20, label: "messages sent" },
];

async function gatherCurrentCounts(supabase: SupabaseClient): Promise<ActivitySnapshot> {
  const [
    { count: totalBooks },
    { count: booksRead },
    { count: booksReadingStarted },
    { count: booksRated },
    { count: booksWithNotes },
    { count: totalMessages },
  ] = await Promise.all([
    supabase.from("books").select("id", { count: "exact", head: true }),
    supabase.from("books").select("id", { count: "exact", head: true }).eq("status", "read"),
    supabase.from("books").select("id", { count: "exact", head: true }).not("date_started", "is", null),
    supabase.from("books").select("id", { count: "exact", head: true }).gt("rating", 0),
    supabase.from("books").select("id", { count: "exact", head: true }).not("notes", "is", null),
    supabase.from("messages").select("id", { count: "exact", head: true }),
  ]);

  return {
    total_books: totalBooks ?? 0,
    books_read: booksRead ?? 0,
    books_reading_started: booksReadingStarted ?? 0,
    books_rated: booksRated ?? 0,
    books_with_notes: booksWithNotes ?? 0,
    total_messages: totalMessages ?? 0,
  };
}

async function checkAndRegenerate(supabase: SupabaseClient): Promise<void> {
  try {
    // Fetch latest profile
    const { data: profile, error } = await supabase
      .from("reader_profile")
      .select("generated_at, generation_context")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[profile-scheduler] Failed to fetch profile:", error.message);
      return;
    }

    // No profile exists yet — skip (first profile should be manual/bootstrap)
    if (!profile) {
      console.log("[profile-scheduler] No profile exists yet, skipping.");
      return;
    }

    // Check age
    const generatedAt = new Date(profile.generated_at);
    const ageDays = (Date.now() - generatedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < MIN_AGE_DAYS) {
      console.log(
        `[profile-scheduler] Profile is ${Math.floor(ageDays)}d old (need ${MIN_AGE_DAYS}d), skipping.`,
      );
      return;
    }

    // Get snapshot from last generation
    const context = profile.generation_context as Record<string, unknown> | null;
    const snapshot = context?.activity_snapshot as ActivitySnapshot | undefined;

    if (!snapshot) {
      // No snapshot stored — can't compare, trigger regeneration since profile is old enough
      console.log(
        "[profile-scheduler] No activity snapshot in last profile, regenerating (profile is old enough).",
      );
      spawnRegeneration();
      return;
    }

    // Gather current counts
    const current = await gatherCurrentCounts(supabase);

    // Check thresholds
    const triggered: string[] = [];
    for (const { key, delta, label } of THRESHOLDS) {
      const diff = current[key] - snapshot[key];
      if (diff >= delta) {
        triggered.push(`${label}: +${diff}`);
      }
    }

    if (triggered.length === 0) {
      console.log("[profile-scheduler] No activity thresholds met, skipping.");
      return;
    }

    console.log(
      `[profile-scheduler] Thresholds met: ${triggered.join(", ")}. Regenerating profile.`,
    );
    spawnRegeneration();
  } catch (err) {
    console.error(
      "[profile-scheduler] Error:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

function spawnRegeneration(): void {
  console.log("[profile-scheduler] Spawning generate-profile.ts --force ...");
  exec(
    "npx tsx scripts/generate-profile.ts --force",
    { cwd: process.cwd() },
    (error, stdout, stderr) => {
      if (error) {
        console.error("[profile-scheduler] Generation failed:", error.message);
        if (stderr) console.error("[profile-scheduler] stderr:", stderr);
        return;
      }
      console.log("[profile-scheduler] Generation output:\n" + stdout);
    },
  );
}

export function startProfileScheduler(supabase: SupabaseClient): void {
  console.log(
    `[profile-scheduler] Will check in ${STARTUP_DELAY_MS / 1000}s, then every ${CHECK_INTERVAL_MS / 3600000}h.`,
  );

  // Initial check after startup delay
  setTimeout(() => {
    void checkAndRegenerate(supabase);
  }, STARTUP_DELAY_MS);

  // Recurring daily check
  setInterval(() => {
    void checkAndRegenerate(supabase);
  }, CHECK_INTERVAL_MS);
}
