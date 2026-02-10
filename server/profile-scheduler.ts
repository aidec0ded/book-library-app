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

async function gatherCurrentCounts(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActivitySnapshot> {
  const [
    { count: totalBooks },
    { count: booksRead },
    { count: booksReadingStarted },
    { count: booksRated },
    { count: booksWithNotes },
    { count: totalMessages },
  ] = await Promise.all([
    supabase.from("books").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("books").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "read"),
    supabase.from("books").select("id", { count: "exact", head: true }).eq("user_id", userId).not("date_started", "is", null),
    supabase.from("books").select("id", { count: "exact", head: true }).eq("user_id", userId).gt("rating", 0),
    supabase.from("books").select("id", { count: "exact", head: true }).eq("user_id", userId).not("notes", "is", null),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("user_id", userId),
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

interface UserProfile {
  user_id: string;
  generated_at: string;
  generation_context: Record<string, unknown> | null;
}

async function fetchLatestProfilePerUser(supabase: SupabaseClient): Promise<UserProfile[]> {
  // Fetch all profiles, grouped by user — get the latest per user
  // Service-role client bypasses RLS, so we see all users
  const { data, error } = await supabase
    .from("reader_profile")
    .select("user_id, generated_at, generation_context")
    .order("generated_at", { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Keep only the latest profile per user_id
  const seen = new Set<string>();
  const latest: UserProfile[] = [];
  for (const row of data) {
    if (!seen.has(row.user_id)) {
      seen.add(row.user_id);
      latest.push(row);
    }
  }
  return latest;
}

async function checkAndRegenerateAll(supabase: SupabaseClient): Promise<void> {
  try {
    const profiles = await fetchLatestProfilePerUser(supabase);

    if (profiles.length === 0) {
      console.log("[profile-scheduler] No user profiles exist yet, skipping.");
      return;
    }

    console.log(`[profile-scheduler] Checking ${profiles.length} user(s)...`);

    for (const profile of profiles) {
      await checkUserProfile(supabase, profile);
    }
  } catch (err) {
    console.error(
      "[profile-scheduler] Error:",
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function checkUserProfile(
  supabase: SupabaseClient,
  profile: UserProfile,
): Promise<void> {
  const { user_id: uid } = profile;
  const tag = `[profile-scheduler:${uid.slice(0, 8)}]`;

  // Check age
  const generatedAt = new Date(profile.generated_at);
  const ageDays = (Date.now() - generatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < MIN_AGE_DAYS) {
    console.log(
      `${tag} Profile is ${Math.floor(ageDays)}d old (need ${MIN_AGE_DAYS}d), skipping.`,
    );
    return;
  }

  // Get snapshot from last generation
  const context = profile.generation_context;
  const snapshot = context?.activity_snapshot as ActivitySnapshot | undefined;

  if (!snapshot) {
    console.log(
      `${tag} No activity snapshot in last profile, regenerating (profile is old enough).`,
    );
    spawnRegeneration(uid);
    return;
  }

  // Gather current counts
  const current = await gatherCurrentCounts(supabase, uid);

  // Check thresholds
  const triggered: string[] = [];
  for (const { key, delta, label } of THRESHOLDS) {
    const diff = current[key] - snapshot[key];
    if (diff >= delta) {
      triggered.push(`${label}: +${diff}`);
    }
  }

  if (triggered.length === 0) {
    console.log(`${tag} No activity thresholds met, skipping.`);
    return;
  }

  console.log(
    `${tag} Thresholds met: ${triggered.join(", ")}. Regenerating profile.`,
  );
  spawnRegeneration(uid);
}

function spawnRegeneration(userId: string): void {
  console.log(`[profile-scheduler] Spawning generate-profile.ts --force --user-id ${userId} ...`);
  exec(
    `npx tsx scripts/generate-profile.ts --force --user-id ${userId}`,
    { cwd: process.cwd() },
    (error, stdout, stderr) => {
      if (error) {
        console.error(`[profile-scheduler:${userId.slice(0, 8)}] Generation failed:`, error.message);
        if (stderr) console.error(`[profile-scheduler:${userId.slice(0, 8)}] stderr:`, stderr);
        return;
      }
      console.log(`[profile-scheduler:${userId.slice(0, 8)}] Generation output:\n` + stdout);
    },
  );
}

export function startProfileScheduler(supabase: SupabaseClient): void {
  console.log(
    `[profile-scheduler] Will check in ${STARTUP_DELAY_MS / 1000}s, then every ${CHECK_INTERVAL_MS / 3600000}h.`,
  );

  // Initial check after startup delay
  setTimeout(() => {
    void checkAndRegenerateAll(supabase);
  }, STARTUP_DELAY_MS);

  // Recurring daily check
  setInterval(() => {
    void checkAndRegenerateAll(supabase);
  }, CHECK_INTERVAL_MS);
}
