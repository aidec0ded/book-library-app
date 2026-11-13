import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../scripts/fetch-all.js";
import { runScript } from "./jobs.js";
import { recordJobRun } from "./usage.js";

/**
 * Reader profiles. A reader's first profile is generated automatically once they have
 * enough books and ratings. After that a profile is never generated without the reader
 * asking, so readers who've stopped coming cost nothing:
 *
 * - Monthly: when the last monthly profile is 30 days old and there's been enough new
 *   activity, the check marks one available (profile_requests.available_at, migration
 *   039), and the app offers it. A monthly profile also re-predicts ratings.
 * - Weekly refresh, Companion only: 7 days after the last profile of any kind, if
 *   anything has changed. It leaves predicted ratings alone and doesn't reset the
 *   monthly schedule.
 *
 * The web server records requests; whichever process runs the schedulers (the worker in
 * production) picks them up every minute and generates them one at a time.
 */

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const REQUEST_POLL_MS = 60 * 1000;
const REFRESH_MIN_DAYS = 7;
// A generation that started this long ago without finishing is taken to have died
// (a restart, say) and is run again
const STUCK_AFTER_MS = 15 * 60 * 1000;
const STARTUP_DELAY_MS = 30 * 1000; // 30 seconds after server start
const MIN_AGE_DAYS = 30;
const NEW_USER_MIN_BOOKS = 8;
const NEW_USER_MIN_RATED = 5;

// Readers queued or generating, so a check can't add the same reader twice
const inFlightUsers = new Set<string>();

// Profiles generate one at a time: each runs in its own ~100MB process, and a handful
// of signups in one check used to start them all at once on a 512MB server
interface ProfileJob {
  userId: string;
  command: string;
  label: string;
  onDone?: (error: string | null) => void;
}
const profileQueue: ProfileJob[] = [];
let profileRunning = false;

function queueProfile(userId: string, command: string, label: string, onDone?: ProfileJob["onDone"]): void {
  if (inFlightUsers.has(userId)) return;
  inFlightUsers.add(userId);
  profileQueue.push({ userId, command, label, onDone });
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
    job.onDone?.(error ? (stderr || error.message).slice(-500) : null);
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

/** A weekly refresh doesn't count toward the monthly schedule. */
const isRefresh = (p: UserProfile) => p.generation_context?.kind === "refresh";

/** Each reader's latest profile that wasn't a weekly refresh: the monthly schedule runs from it. */
async function fetchLatestMonthlyProfilePerUser(supabase: SupabaseClient): Promise<UserProfile[]> {
  const rows = await fetchAllRows<UserProfile>((from, to) =>
    supabase
      .from("reader_profile")
      .select("user_id, generated_at, generation_context")
      .order("generated_at", { ascending: false })
      .range(from, to),
  );
  const seen = new Set<string>();
  const latest: UserProfile[] = [];
  for (const row of rows) {
    if (isRefresh(row) || seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    latest.push(row);
  }
  return latest;
}

/** What's changed since a profile's activity snapshot, as "label: +n" for each counter that grew past `minDelta` of its threshold. */
function changesSince(current: ActivitySnapshot, snapshot: ActivitySnapshot, anyChange: boolean): string[] {
  const changes: string[] = [];
  for (const { key, delta, label } of THRESHOLDS) {
    const diff = current[key] - (snapshot[key] ?? 0);
    if (anyChange ? diff > 0 : diff >= delta) changes.push(`${label}: +${diff}`);
  }
  return changes;
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

    const profiles = await fetchLatestMonthlyProfilePerUser(supabase);

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

  let triggered: string[] = ["no activity snapshot in the last profile"];
  if (snapshot) {
    const current = await gatherCurrentCounts(supabase, uid);
    triggered = changesSince(current, snapshot, false);
    if (triggered.length === 0) {
      console.log(`${tag} No activity thresholds met, skipping.`);
      return;
    }
  }

  // Offer it rather than generate it: the reader generates it when they want it
  const { data: row } = await supabase.from("profile_requests").select("available_at").eq("user_id", uid).maybeSingle();
  if (row?.available_at) return;
  const { error } = await supabase
    .from("profile_requests")
    .upsert({ user_id: uid, available_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(`profile_requests: ${error.message}`);
  console.log(`${tag} Monthly profile due (${triggered.join(", ")}). Offered to the reader.`);
}

// --- Requests from readers ---

interface RequestRow {
  user_id: string;
  available_at: string | null;
  requested_at: string | null;
  kind: "monthly" | "refresh" | null;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

const after = (a: string | null, b: string | null) => a != null && (b == null || Date.parse(a) > Date.parse(b));

/** A request that hasn't finished since it was made. */
function isPending(row: RequestRow): boolean {
  return after(row.requested_at, row.finished_at);
}

export interface ProfileStatus {
  has_profile: boolean;
  last_generated_at: string | null;
  /** A monthly profile is due and waiting for the reader */
  monthly_available: boolean;
  /** Asked for and not finished yet */
  generating: boolean;
  /** Companion readers: whether a weekly refresh is possible now */
  can_refresh: boolean;
  /** Why not, when it isn't: "too_soon" (see refresh_available_at), "nothing_new", or "companion_only" */
  refresh_blocked: "too_soon" | "nothing_new" | "companion_only" | null;
  refresh_available_at: string | null;
  /** The last request failed */
  error: string | null;
}

/** Where a reader's profile stands, for the app's banner and Profile page. */
export async function profileStatus(
  supabase: SupabaseClient,
  userId: string,
  companion: boolean,
): Promise<ProfileStatus> {
  const [{ data: latest }, { data: row }] = await Promise.all([
    supabase
      .from("reader_profile")
      .select("user_id, generated_at, generation_context")
      .eq("user_id", userId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("profile_requests").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  const request = row as RequestRow | null;
  const profile = latest as UserProfile | null;
  const generating = request ? isPending(request) : false;
  const status: ProfileStatus = {
    has_profile: profile != null,
    last_generated_at: profile?.generated_at ?? null,
    monthly_available: Boolean(request?.available_at) && !generating,
    generating,
    can_refresh: false,
    refresh_blocked: null,
    refresh_available_at: null,
    error: request && !generating && after(request.finished_at, null) ? request.error : null,
  };
  if (!profile || generating || status.monthly_available) return status;

  if (!companion) {
    status.refresh_blocked = "companion_only";
    return status;
  }
  const nextAt = Date.parse(profile.generated_at) + REFRESH_MIN_DAYS * 86_400_000;
  if (Date.now() < nextAt) {
    status.refresh_blocked = "too_soon";
    status.refresh_available_at = new Date(nextAt).toISOString();
    return status;
  }
  const snapshot = profile.generation_context?.activity_snapshot as ActivitySnapshot | undefined;
  if (snapshot && changesSince(await gatherCurrentCounts(supabase, userId), snapshot, true).length === 0) {
    status.refresh_blocked = "nothing_new";
    return status;
  }
  status.can_refresh = true;
  return status;
}

/**
 * A reader asks for a profile: the monthly one if it's available, otherwise a weekly
 * refresh if they may have one. Returns the kind queued, or why not.
 */
export async function requestProfile(
  supabase: SupabaseClient,
  userId: string,
  companion: boolean,
): Promise<{ kind: "monthly" | "refresh" } | { error: string }> {
  const status = await profileStatus(supabase, userId, companion);
  if (status.generating) return { error: "already_generating" };
  const kind = status.monthly_available ? "monthly" : status.can_refresh ? "refresh" : null;
  if (!kind) return { error: status.refresh_blocked ?? (status.has_profile ? "not_available" : "no_profile") };
  const { error } = await supabase
    .from("profile_requests")
    .upsert(
      { user_id: userId, requested_at: new Date().toISOString(), kind, started_at: null, error: null },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(`profile_requests: ${error.message}`);
  return { kind };
}

/** Start any requests not yet started (or started so long ago they must have died). */
export async function runProfileRequests(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.from("profile_requests").select("*").not("requested_at", "is", null);
  if (error) {
    console.error("[profile-scheduler] Couldn't check for requests:", error.message);
    return;
  }
  for (const row of (data ?? []) as RequestRow[]) {
    if (!isPending(row) || inFlightUsers.has(row.user_id)) continue;
    const startedForThis = after(row.started_at, row.requested_at) || row.started_at === row.requested_at;
    if (startedForThis && Date.now() - Date.parse(row.started_at!) < STUCK_AFTER_MS) continue;

    const uid = row.user_id;
    const refresh = row.kind === "refresh";
    await supabase.from("profile_requests").update({ started_at: new Date().toISOString() }).eq("user_id", uid);
    queueProfile(
      uid,
      `npx tsx scripts/generate-profile.ts --force --user-id ${uid}${refresh ? " --keep-predictions" : ""}`,
      refresh ? "Weekly refresh" : "Monthly profile",
      (failure) => {
        void supabase
          .from("profile_requests")
          .update({
            finished_at: new Date().toISOString(),
            error: failure ? "The profile couldn't be generated. Try again in a few minutes." : null,
            // The monthly profile is done; the next one is offered when it's due
            ...(!failure && !refresh && { available_at: null }),
          })
          .eq("user_id", uid)
          .then(({ error: updateError }) => {
            if (updateError) console.error("[profile-scheduler] Couldn't record a finished request:", updateError.message);
          });
        if (failure) console.error(`[profile-scheduler:${uid.slice(0, 8)}] Request failed:`, failure);
      },
    );
  }
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

  // Readers' requests, from the web server
  setInterval(() => void runProfileRequests(supabase), REQUEST_POLL_MS);
  setTimeout(() => void runProfileRequests(supabase), 5_000);
}
