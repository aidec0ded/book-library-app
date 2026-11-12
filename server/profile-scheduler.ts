import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../scripts/fetch-all.js";
import { runScript } from "./jobs.js";
import { recordJobRun } from "./usage.js";

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const STARTUP_DELAY_MS = 30 * 1000; // 30 seconds after server start
const MIN_AGE_DAYS = 30;
const NEW_USER_MIN_BOOKS = 8;
const NEW_USER_MIN_RATED = 5;

// Readers queued or generating, so a check can't add the same reader twice
const inFlightUsers = new Set<string>();

// Profiles generate one at a time: each is an Opus run in its own ~100MB process, and a
// handful of signups in one check used to start them all at once on a 512MB server
const profileQueue: { userId: string; command: string; label: string }[] = [];
let profileRunning = false;

function queueProfile(userId: string, command: string, label: string): void {
  if (inFlightUsers.has(userId)) return;
  inFlightUsers.add(userId);
  profileQueue.push({ userId, command, label });
  runNextProfile();
}

function runNextProfile(): void {
  if (profileRunning) return;
  const job = profileQueue.shift();
  if (!job) return;
  profileRunning = true;
  const tag = `[profile-scheduler:${job.userId.slice(0, 8)}]`;
  console.log(`[profile-scheduler] Starting: ${job.command} (${profileQueue.length} more waiting)`);
  runScript(job.command, (error, stdout, stderr) => {
    profileRunning = false;
    inFlightUsers.delete(job.userId);
    if (error) {
      console.error(`${tag} ${job.label} failed:`, error.message);
      if (stderr) console.error(`${tag} stderr:`, stderr);
    } else {
      console.log(`${tag} ${job.label} output:\n` + stdout);
    }
    runNextProfile();
  });
}

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

async function checkNewUsers(supabase: SupabaseClient): Promise<void> {
  // Every reader has a subscription row from signup, so this lists them all. (It used
  // to read the first 1,000 book rows, which misses readers as libraries grow.)
  const readers = await fetchAllRows<{ user_id: string }>((from, to) =>
    supabase.from("user_subscriptions").select("user_id").order("user_id").range(from, to),
  );
  if (readers.length === 0) return;

  const profileUsers = await fetchAllRows<{ user_id: string }>((from, to) =>
    supabase.from("reader_profile").select("user_id").order("user_id").range(from, to),
  );

  const usersWithProfiles = new Set(profileUsers.map((r) => r.user_id));
  const newUsers = readers.map((r) => r.user_id).filter((uid) => !usersWithProfiles.has(uid));

  if (newUsers.length === 0) return;

  console.log(`[profile-scheduler] Found ${newUsers.length} user(s) without profiles.`);

  for (const uid of newUsers) {
    if (inFlightUsers.has(uid)) continue;
    const counts = await gatherCurrentCounts(supabase, uid);
    const tag = `[profile-scheduler:${uid.slice(0, 8)}]`;

    if (counts.total_books >= NEW_USER_MIN_BOOKS && counts.books_rated >= NEW_USER_MIN_RATED) {
      console.log(
        `${tag} New user meets thresholds (${counts.total_books} books, ${counts.books_rated} rated). Generating first profile.`,
      );
      spawnFirstProfile(uid);
    } else {
      console.log(
        `${tag} New user below thresholds (${counts.total_books}/${NEW_USER_MIN_BOOKS} books, ${counts.books_rated}/${NEW_USER_MIN_RATED} rated).`,
      );
    }
  }
}

function spawnFirstProfile(userId: string): void {
  queueProfile(userId, `npx tsx scripts/generate-profile.ts --force --bootstrap --user-id ${userId}`, "First profile");
}

async function checkAndRegenerateAll(supabase: SupabaseClient): Promise<void> {
  let failure: string | null = null;
  try {
    // Check for new users without any profile first
    await checkNewUsers(supabase);

    const profiles = await fetchLatestProfilePerUser(supabase);

    if (profiles.length === 0) {
      console.log("[profile-scheduler] No existing profiles to check for regeneration.");
      return;
    }

    console.log(`[profile-scheduler] Checking ${profiles.length} user(s)...`);

    for (const profile of profiles) {
      await checkUserProfile(supabase, profile);
    }
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
    console.error(
      "[profile-scheduler] Error:",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    void recordJobRun("profile_check", failure ? { ok: false, error: failure } : { ok: true });
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
  queueProfile(userId, `npx tsx scripts/generate-profile.ts --force --user-id ${userId}`, "Profile regeneration");
}

export function startProfileScheduler(supabase: SupabaseClient): void {
  console.log(
    `[profile-scheduler] Will check in ${STARTUP_DELAY_MS / 1000}s, then every ${CHECK_INTERVAL_MS / 3600000}h.`,
  );

  // Initial check after startup delay
  setTimeout(() => {
    void checkAndRegenerateAll(supabase);
  }, STARTUP_DELAY_MS);

  // Recurring check
  setInterval(() => {
    void checkAndRegenerateAll(supabase);
  }, CHECK_INTERVAL_MS);
}
