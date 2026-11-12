import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../scripts/fetch-all.js";

/**
 * The daily stop for chat spending. Past DAILY_CHAT_BUDGET_USD (default $25) in a UTC
 * day, chat answers "busy" instead of calling the API, so a burst of use can't run up
 * the bill. The Anthropic Console's workspace spend limit is the backstop behind it.
 *
 * The total is kept in memory (one server) and loaded from chat_token_usage when the
 * server starts or the day changes. Logged rows don't record which cache duration a
 * write used, so on reload writes are priced at the 1-hour rate, the higher one.
 */

export const BUSY_MESSAGE =
  "Your reading companion is resting for a bit because a lot of readers are chatting right now. Please try again later.";

const DEFAULT_DAILY_BUDGET_USD = 25;

interface Prices {
  input: number;
  output: number;
  write5m: number;
  write1h: number;
  read: number;
}

/** Dollars per million tokens. */
const PRICES: Record<string, Prices> = {
  "claude-sonnet-5-5": { input: 2, output: 10, write5m: 2.5, write1h: 4, read: 0.1 },
  "claude-opus-5-5": { input: 4, output: 20, write5m: 5, write1h: 8, read: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, write5m: 0.125, write1h: 0.2, read: 0.01 },
};
// A model missing from the table is priced as the most expensive one, to stay on the safe side
const FALLBACK_PRICES = PRICES["claude-opus-5-5"];

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
}

/** What one API call cost, in dollars. */
export function usageCost(model: string, usage: TokenUsage): number {
  const p = PRICES[model] ?? FALLBACK_PRICES;
  const writes = usage.cache_creation_input_tokens ?? 0;
  const writes1h = usage.cache_creation ? (usage.cache_creation.ephemeral_1h_input_tokens ?? 0) : writes;
  const writes5m = writes - writes1h;
  return (
    usage.input_tokens * p.input +
    usage.output_tokens * p.output +
    writes5m * p.write5m +
    writes1h * p.write1h +
    (usage.cache_read_input_tokens ?? 0) * p.read
  ) / 1e6;
}

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
  const rows = await fetchAllRows<TokenUsage & { model: string }>((from, to) =>
    supabase
      .from("chat_token_usage")
      .select("model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens")
      .gte("created_at", `${forDay}T00:00:00Z`)
      .order("created_at")
      .range(from, to),
  );
  if (day === forDay) spent += rows.reduce((n, r) => n + usageCost(r.model, r), 0);
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
