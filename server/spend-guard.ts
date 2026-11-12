import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../scripts/fetch-all.js";
import { usageCost, type TokenUsage } from "./usage.js";

export type { TokenUsage } from "./usage.js";

/** The calls that bill the chat workspace and count toward the daily stop */
export const CHAT_FEATURES = ["chat", "title", "greeting", "condense"];

/**
 * The daily stop for chat spending. Past DAILY_CHAT_BUDGET_USD (default $25) in a UTC
 * day, chat answers "busy" instead of calling the API, so a burst of use can't run up
 * the bill. The Anthropic Console's workspace spend limit is the backstop behind it.
 *
 * The total is kept in memory (one server) and loaded from api_usage, which records
 * each call's cost, when the server starts or the day changes.
 */

export const BUSY_MESSAGE =
  "Your reading companion is resting for a bit because a lot of readers are chatting right now. Please try again later.";

const DEFAULT_DAILY_BUDGET_USD = 25;

export function dailyBudget(): number {
  const configured = Number(process.env.DAILY_CHAT_BUDGET_USD);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_DAILY_BUDGET_USD;
}

const utcDay = () => new Date().toISOString().slice(0, 10);

let day = "";
let spent = 0;
let loading: Promise<void> | null = null;
let warnedDay = "";

async function loadDay(supabase: SupabaseClient, forDay: string): Promise<void> {
  const rows = await fetchAllRows<{ cost_usd: number }>((from, to) =>
    supabase
      .from("api_usage")
      .select("cost_usd")
      .eq("provider", "anthropic")
      .in("feature", CHAT_FEATURES)
      .gte("created_at", `${forDay}T00:00:00Z`)
      .order("created_at")
      .range(from, to),
  );
  if (day === forDay) spent += rows.reduce((n, r) => n + Number(r.cost_usd), 0);
}

/** Start a new day's total, loading what's already been spent today. Service-role client. */
async function ensureDay(supabase: SupabaseClient): Promise<void> {
  const today = utcDay();
  if (day !== today) {
    day = today;
    spent = 0;
    loading = loadDay(supabase, today).catch((err) => {
      console.error("[spend] Couldn't load today's chat spending:", err instanceof Error ? err.message : err);
    });
  }
  if (loading) await loading;
}

/** Add a chat API call to today's total. Call it alongside logging the call's usage. */
export function recordSpend(model: string, usage: TokenUsage): void {
  if (day !== utcDay()) return; // the next check reloads the new day, including this call
  spent += usageCost(model, usage);
}

/** Whether today's chat spending has reached the daily budget. */
export async function dailyBudgetReached(supabase: SupabaseClient): Promise<boolean> {
  await ensureDay(supabase);
  const budget = dailyBudget();
  if (spent < budget) return false;
  if (warnedDay !== day) {
    warnedDay = day;
    console.error(`[spend] Daily chat budget of $${budget} reached ($${spent.toFixed(2)} spent). Chat is paused until 00:00 UTC.`);
  }
  return true;
}

/** Today's chat spending so far, for logs and checks. */
export async function spentToday(supabase: SupabaseClient): Promise<number> {
  await ensureDay(supabase);
  return spent;
}

/**
 * An Anthropic error that means "try again later" rather than a bug: a spend limit set
 * in the Console (400), the tier's monthly cap or a rate limit (429), or overload (529).
 */
export function isCapacityError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("status" in err)) return false;
  const status = (err as { status?: number }).status;
  const message = err instanceof Error ? err.message : "";
  return status === 429 || status === 529 || (status === 400 && /usage limits/i.test(message));
}
