import type { SupabaseClient } from "@supabase/supabase-js";
import { BACKGROUND_RESERVE } from "./isbndb.js";
import { dailyBudget } from "./spend-guard.js";

/**
 * Email alerts from the background worker, sent with Resend (RESEND_API_KEY, from
 * ALERT_FROM to ALERT_TO). Every 15 minutes it checks spending, signups, background
 * jobs, quotas, readers at their monthly cap, and the daily cost check, and once a
 * day after 14:00 UTC it sends a summary of the day before. Each alert goes out once
 * per period (alerts_sent, migration 035). The thresholds can be set in the worker's
 * environment; DAILY_CHAT_BUDGET_USD and PAID_MONTHLY_REPLY_CAP should match the web
 * service's.
 */

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const STARTUP_DELAY_MS = 2 * 60 * 1000;
const SUMMARY_HOUR_UTC = 14;
const ADMIN_URL = "https://www.rekollekt.io/admin";

const numberEnv = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** How often each scheduler reports; three missed intervals counts as stalled (as on the admin page). */
const JOB_INTERVALS_MIN: Record<string, number> = {
  enrichment_check: 5,
  conversation_review: 10,
  embeddings: 10,
  profile_check: 240,
  releases_check: 240,
  cost_reconciliation: 60,
  stripe_reconciliation: 60,
};

interface Revenue {
  month: { payments: number; refunds: number; fees: number };
  mrr: number;
  paying_readers: number;
  services: { service: string; memory_mb: number; limit_mb: number | null; peak_mb: number; peak_day: string; reported_at: string }[];
}

const MEMORY_LIMIT_MB = 512; // Render Starter, if the container doesn't report a limit

interface Overview {
  daily_costs: { day: string; provider: string; feature: string; cost: number }[];
  daily_activity: { day: string; signups: number; chat_messages: number; chatting_readers: number; books_added: Record<string, number> }[];
  spend_today: Record<string, number>;
  totals: { readers: number };
  quotas: {
    isbndb: { remaining: number; resets_at: string } | null;
    voyage_tokens_total: number;
    database_bytes: number;
  };
  jobs: { job: string; last_run_at: string; last_ok_at: string | null; last_error: string | null; last_error_at: string | null }[];
}

const money = (v: number) => `$${v.toFixed(2)}`;
const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendEmail(subject: string, lines: string[]): Promise<void> {
  const text = [...lines, "", `Telemetry: ${ADMIN_URL}`].join("\n");
  const html =
    `<div style="font-family: system-ui, sans-serif; font-size: 14px; line-height: 1.5">` +
    lines.map((l) => (l ? `<p style="margin: 0 0 8px">${escapeHtml(l)}</p>` : "")).join("") +
    `<p style="margin-top: 16px"><a href="${ADMIN_URL}">Open telemetry</a></p></div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.ALERT_FROM, to: [process.env.ALERT_TO], subject, text, html }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/**
 * Send an alert unless one with this key has already gone out. The key is claimed
 * first, so a restart or an overlapping check can't send it twice; if sending fails,
 * the claim is released and the next check tries again.
 */
let dryRun = false;

async function sendOnce(service: SupabaseClient, key: string, subject: string, lines: string[]): Promise<boolean> {
  if (dryRun) {
    const { data: sent } = await service.from("alerts_sent").select("key").eq("key", key).maybeSingle();
    console.log(`[alerts] Would ${sent ? "skip (already sent)" : "send"}: ${subject}\n    ${lines.join("\n    ")}`);
    return false;
  }
  const { data, error } = await service
    .from("alerts_sent")
    .upsert({ key, subject }, { onConflict: "key", ignoreDuplicates: true })
    .select("key");
  if (error) throw error;
  if (!data || data.length === 0) return false; // already sent
  try {
    await sendEmail(subject, lines);
    console.log(`[alerts] Sent: ${subject}`);
    return true;
  } catch (err) {
    await service.from("alerts_sent").delete().eq("key", key);
    throw err;
  }
}

async function runChecks(service: SupabaseClient): Promise<void> {
  const { data, error } = await service.rpc("admin_overview", { p_days: 2 });
  if (error) throw error;
  const o = data as Overview;
  const today = utcDay();
  const spentToday = Object.values(o.spend_today).reduce((a, b) => a + b, 0);
  const chatToday = o.spend_today.chat ?? 0;

  // Spending
  const spendThreshold = numberEnv("ALERT_DAILY_SPEND_USD", 10);
  if (spentToday >= spendThreshold) {
    await sendOnce(service, `spend:${today}`, `Rekollekt: ${money(spentToday)} spent on AI today`, [
      `Today's AI spending has passed ${money(spendThreshold)}: ${money(spentToday)} so far.`,
      `Chat ${money(chatToday)}, background ${money(o.spend_today.background ?? 0)}, embeddings ${money(o.spend_today.voyage ?? 0)}.`,
    ]);
  }
  const budget = dailyBudget();
  if (chatToday >= budget) {
    await sendOnce(service, `chat_stop:${today}`, "Rekollekt: chat is paused for the rest of the day", [
      `Chat spending reached the daily stop of ${money(budget)} (${money(chatToday)}), so readers are told the companion is busy until 00:00 UTC.`,
      "Raise DAILY_CHAT_BUDGET_USD on the web service in Render to resume sooner.",
    ]);
  }

  // Signups
  const signupThreshold = numberEnv("ALERT_SIGNUPS_PER_HOUR", 20);
  const { data: hourSignups, error: signupError } = await service.rpc("admin_signups_since", {
    p_since: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });
  if (signupError) throw signupError;
  if ((hourSignups as number) >= signupThreshold) {
    await sendOnce(service, `signups:${new Date().toISOString().slice(0, 13)}`, `Rekollekt: ${hourSignups} signups in the last hour`, [
      `${hourSignups} accounts were created in the last hour (alert at ${signupThreshold}).`,
      "If this looks like scripted signups, check the captcha in Supabase Auth and the newest accounts.",
    ]);
  }

  // Background jobs
  for (const job of o.jobs) {
    const failing = job.last_error_at && (!job.last_ok_at || job.last_error_at > job.last_ok_at);
    if (failing) {
      await sendOnce(service, `job_failing:${job.job}:${today}`, `Rekollekt: ${job.job} is failing`, [
        `The background job "${job.job}" last failed ${job.last_error_at} and hasn't succeeded since.`,
        `Error: ${job.last_error ?? "(none recorded)"}`,
        "The worker's logs in Render have the details.",
      ]);
    }
    const interval = JOB_INTERVALS_MIN[job.job];
    if (interval && Date.now() - new Date(job.last_run_at).getTime() > interval * 3 * 60 * 1000) {
      await sendOnce(service, `job_stalled:${job.job}:${today}`, `Rekollekt: ${job.job} has stopped running`, [
        `The background job "${job.job}" should run every ${interval} minutes but last ran ${job.last_run_at}.`,
        "Check that the background worker is running in Render.",
      ]);
    }
  }

  // Quotas
  const isbndb = o.quotas.isbndb;
  if (isbndb && new Date(isbndb.resets_at).getTime() > Date.now() && isbndb.remaining <= BACKGROUND_RESERVE) {
    await sendOnce(service, `isbndb_low:${today}`, "Rekollekt: ISBNdb background lookups paused for today", [
      `ISBNdb has ${isbndb.remaining} calls left today, so background lookups have stopped to keep ${BACKGROUND_RESERVE} for Add Book and chat. They resume after midnight UTC.`,
      "If this happens often, imports need a bigger ISBNdb plan or another source.",
    ]);
  }
  const voyageShare = o.quotas.voyage_tokens_total / 200_000_000;
  for (const level of [0.8, 0.95]) {
    if (voyageShare >= level) {
      await sendOnce(service, `voyage_${level * 100}`, `Rekollekt: ${Math.round(voyageShare * 100)}% of Voyage's free tokens used`, [
        `Embeddings have used ${(o.quotas.voyage_tokens_total / 1e6).toFixed(0)}M of Voyage's 200M free tokens. After that, voyage-4 costs $0.06 per million tokens.`,
      ]);
    }
  }
  const dbShare = o.quotas.database_bytes / (8 * 1024 ** 3);
  if (dbShare >= 0.8) {
    await sendOnce(service, `database_80:${today.slice(0, 7)}`, `Rekollekt: database at ${Math.round(dbShare * 100)}% of the included 8GB`, [
      `The database is ${(o.quotas.database_bytes / 1024 ** 3).toFixed(1)}GB. Supabase Pro adds storage automatically beyond 8GB, charged per GB.`,
    ]);
  }

  // Readers at their monthly cap
  const cap = numberEnv("PAID_MONTHLY_REPLY_CAP", 100);
  const { data: capped, error: capError } = await service.rpc("admin_capped_readers", { p_cap: cap });
  if (capError) throw capError;
  for (const reader of (capped ?? []) as { user_id: string; email: string; used: number }[]) {
    await sendOnce(service, `reply_cap:${reader.user_id}:${today.slice(0, 7)}`, `Rekollekt: a reader reached the ${cap}-reply cap`, [
      `${reader.email} has used ${reader.used} replies this month and can't chat again until the 1st.`,
      "If they're a real reader using it heavily, that's useful to know before setting paid-plan limits.",
    ]);
  }

  // Recorded costs that don't match Anthropic's (days checked at least a day ago)
  const { data: recon, error: reconError } = await service
    .from("cost_reconciliation")
    .select("day, workspace, workspace_name, anthropic_usd, recorded_usd")
    .gte("day", utcDay(new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)));
  if (reconError) throw reconError;
  for (const r of recon ?? []) {
    const billed = Number(r.anthropic_usd), recorded = Number(r.recorded_usd);
    const gap = billed - recorded;
    if (Math.abs(gap) >= Math.max(0.5, billed * 0.15)) {
      const where = r.workspace === "other" ? `other workspaces (${r.workspace_name ?? "unnamed"})` : `the ${r.workspace} workspace`;
      await sendOnce(service, `reconcile:${r.day}:${r.workspace}`, `Rekollekt: ${money(Math.abs(gap))} of AI cost on ${r.day} doesn't match`, [
        `On ${r.day}, Anthropic billed ${money(billed)} to ${where}, and the app recorded ${money(recorded)}.`,
        gap > 0
          ? "More was billed than recorded: some calls aren't going through the app's recording (another key, a script, or local testing)."
          : "The app recorded more than was billed: its prices may be out of date.",
      ]);
    }
  }

  // Money: disputes (they have a response deadline), and Stripe days that don't match the webhook's
  const { data: revenueData, error: revenueError } = await service.rpc("admin_revenue");
  if (revenueError) throw revenueError;
  const revenue = revenueData as Revenue;
  const { data: disputes, error: disputeError } = await service
    .from("billing_events")
    .select("id, details, occurred_at, user_id")
    .eq("kind", "dispute")
    .gte("occurred_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  if (disputeError) throw disputeError;
  for (const d of disputes ?? []) {
    const details = (d.details ?? {}) as { amount_usd?: number; reason?: string; due_by?: string | null };
    await sendOnce(service, `dispute:${d.id}`, `Rekollekt: a payment of ${money(details.amount_usd ?? 0)} is disputed`, [
      `A reader's bank has disputed a payment (${details.reason ?? "no reason given"}). Stripe has taken the amount and a dispute fee from the balance.`,
      details.due_by ? `Evidence is due by ${details.due_by.slice(0, 10)}. Respond in the Stripe dashboard under Payments → Disputes.` : "Respond in the Stripe dashboard under Payments → Disputes.",
    ]);
  }
  const { data: stripeDays, error: stripeDaysError } = await service
    .from("stripe_reconciliation")
    .select("day, stripe_usd, recorded_usd")
    .gte("day", utcDay(new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)));
  if (stripeDaysError) throw stripeDaysError;
  for (const r of stripeDays ?? []) {
    const gap = Number(r.stripe_usd) - Number(r.recorded_usd);
    if (Math.abs(gap) >= 1) {
      await sendOnce(service, `stripe_reconcile:${r.day}`, `Rekollekt: ${money(Math.abs(gap))} of revenue on ${r.day} doesn't match Stripe`, [
        `On ${r.day}, Stripe's balance shows ${money(Number(r.stripe_usd))} in payments less refunds, and the app recorded ${money(Number(r.recorded_usd))}.`,
        gap > 0
          ? "Stripe has more: a webhook probably failed. Check Developers → Webhooks in Stripe for failed deliveries; resending them records the payment and upgrades the reader if that was missed."
          : "The app recorded more than Stripe shows; a payment near midnight UTC can land on the next day.",
      ]);
    }
  }

  // Server memory
  for (const svc of revenue.services) {
    const limit = svc.limit_mb ?? MEMORY_LIMIT_MB;
    const share = svc.memory_mb / limit;
    if (share >= 0.85) {
      await sendOnce(service, `memory:${svc.service}:${today}`, `Rekollekt: the ${svc.service} server is at ${Math.round(share * 100)}% of its memory`, [
        `The ${svc.service} service is using ${Math.round(svc.memory_mb)}MB of ${Math.round(limit)}MB (today's peak ${Math.round(svc.peak_mb)}MB). Past the limit, Render restarts it.`,
        svc.service === "worker"
          ? "Background scripts are the usual cause; if it keeps happening, the worker needs a bigger instance."
          : "If it keeps happening, the web service needs a bigger instance.",
      ]);
    }
    if (svc.service === "web" && Date.now() - new Date(svc.reported_at).getTime() > 20 * 60 * 1000) {
      await sendOnce(service, `health_stale:${svc.service}:${today}`, "Rekollekt: the web server has stopped reporting", [
        `The web service last reported its memory ${svc.reported_at}; it reports every 5 minutes.`,
        "Check that it's running in Render.",
      ]);
    }
  }

  // Daily summary of yesterday
  if (process.env.ALERT_DAILY_SUMMARY !== "false" && new Date().getUTCHours() >= SUMMARY_HOUR_UTC) {
    const yesterday = utcDay(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const costs = o.daily_costs.filter((c) => c.day === yesterday);
    const total = costs.reduce((n, c) => n + c.cost, 0);
    const chat = costs.filter((c) => c.provider === "anthropic" && ["chat", "title", "greeting", "condense"].includes(c.feature)).reduce((n, c) => n + c.cost, 0);
    const activity = o.daily_activity.find((a) => a.day === yesterday);
    const books = Object.entries(activity?.books_added ?? {}).map(([k, n]) => `${n} via ${k}`).join(", ") || "none";
    const failing = o.jobs.filter((j) => j.last_error_at && (!j.last_ok_at || j.last_error_at > j.last_ok_at)).map((j) => j.job);
    const { data: billing, error: billingError } = await service
      .from("billing_events")
      .select("kind, amount_usd")
      .gte("occurred_at", `${yesterday}T00:00:00Z`)
      .lt("occurred_at", `${today}T00:00:00Z`);
    if (billingError) throw billingError;
    const sumOf = (kind: string) => (billing ?? []).filter((b) => b.kind === kind).reduce((n, b) => n + Number(b.amount_usd), 0);
    const countOf = (kind: string) => (billing ?? []).filter((b) => b.kind === kind).length;
    const revenueLine =
      `Revenue: ${money(sumOf("payment"))} in payments` +
      (countOf("refund") ? `, ${money(-sumOf("refund"))} refunded` : "") +
      `; ${countOf("subscribed")} new subscriptions, ${countOf("canceled")} ended. ` +
      `${revenue.paying_readers} paying readers, ${money(revenue.mrr)} a month recurring.`;
    await sendOnce(service, `summary:${yesterday}`, `Rekollekt on ${yesterday}: ${money(total)}, ${activity?.signups ?? 0} signups`, [
      `AI cost: ${money(total)} (chat ${money(chat)}, everything else ${money(total - chat)}).`,
      `Readers: ${activity?.signups ?? 0} signups, ${activity?.chatting_readers ?? 0} chatting, ${activity?.chat_messages ?? 0} messages. ${o.totals.readers} readers in all.`,
      `Books added: ${books}.`,
      revenueLine,
      failing.length > 0 ? `Failing jobs: ${failing.join(", ")}.` : "All background jobs are running.",
    ]);
  }
}

/** Every 15 minutes in the worker. Does nothing until Resend is configured. */
export function startAlerts(service: SupabaseClient): void {
  if (!process.env.RESEND_API_KEY || !process.env.ALERT_FROM || !process.env.ALERT_TO) {
    console.log("[alerts] RESEND_API_KEY, ALERT_FROM, or ALERT_TO not set; alerts are off.");
    return;
  }
  const run = async () => {
    try {
      await runChecks(service);
    } catch (err) {
      console.error("[alerts] Check failed:", err instanceof Error ? err.message : err);
    }
  };
  console.log(`[alerts] Will check in ${STARTUP_DELAY_MS / 60000}min, then every ${CHECK_INTERVAL_MS / 60000}min.`);
  setTimeout(() => {
    void run();
    setInterval(() => void run(), CHECK_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

/** Run every check once, logging what would be sent instead of sending it. */
export async function previewAlerts(service: SupabaseClient): Promise<void> {
  dryRun = true;
  try {
    await runChecks(service);
  } finally {
    dryRun = false;
  }
}

/** For testing setup: one email straight away, bypassing the once-only record. */
export function sendTestEmail(): Promise<void> {
  return sendEmail("Rekollekt alerts are set up", [
    "This is a test from the background worker's alert checks.",
    "You'll get an email here when spending, signups, background jobs, or quotas need attention, and a summary each day after 14:00 UTC.",
  ]);
}
