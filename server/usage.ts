import type Anthropic from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Telemetry: what every paid API call costs (api_usage) and whether background jobs
 * run (job_heartbeats), both from migration 034. The server, the worker, and scripts
 * all record here with the service role. The admin page and alert checks read it.
 */

let service: SupabaseClient | null = null;
function db(): SupabaseClient {
  service ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  return service;
}

// --- Prices (dollars per million tokens) ---

interface Prices {
  input: number;
  output: number;
  write5m: number;
  write1h: number;
  read: number;
}

const PRICES: Record<string, Prices> = {
  "claude-sonnet-5-5": { input: 2, output: 10, write5m: 2.5, write1h: 4, read: 0.1 },
  "claude-opus-5-5": { input: 4, output: 20, write5m: 5, write1h: 8, read: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, write5m: 0.125, write1h: 0.2, read: 0.01 },
};
// A model missing from the table is priced as the most expensive one, to stay on the safe side
const FALLBACK_PRICES = PRICES["claude-opus-5-5"];

/** Voyage voyage-4, per million tokens. The first 200 million are free; this is the list price. */
export const VOYAGE_PRICE_PER_MTOK = 0.06;

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
}

/**
 * What one Claude call cost, in dollars. Without a breakdown of cache writes by
 * duration, writes are priced at the 1-hour rate, the higher one. Batches are half price.
 */
export function usageCost(model: string, usage: TokenUsage, { batch = false } = {}): number {
  const p = PRICES[model] ?? FALLBACK_PRICES;
  const writes = usage.cache_creation_input_tokens ?? 0;
  const writes1h = usage.cache_creation ? (usage.cache_creation.ephemeral_1h_input_tokens ?? 0) : writes;
  const writes5m = writes - writes1h;
  const full =
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      writes5m * p.write5m +
      writes1h * p.write1h +
      (usage.cache_read_input_tokens ?? 0) * p.read) /
    1e6;
  return batch ? full / 2 : full;
}

// --- Recording ---

export interface UsageRecord {
  provider: "anthropic" | "voyage" | "isbndb";
  feature: string;
  model?: string | null;
  userId?: string | null;
  conversationId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  calls?: number;
  costUsd?: number;
  batch?: boolean;
}

/** Record one call. Never throws: telemetry mustn't break the work it measures. */
export async function recordUsage(record: UsageRecord): Promise<void> {
  try {
    const { error } = await db().from("api_usage").insert({
      provider: record.provider,
      feature: record.feature,
      model: record.model ?? null,
      user_id: record.userId ?? null,
      conversation_id: record.conversationId ?? null,
      input_tokens: record.inputTokens ?? 0,
      output_tokens: record.outputTokens ?? 0,
      cache_write_tokens: record.cacheWriteTokens ?? 0,
      cache_read_tokens: record.cacheReadTokens ?? 0,
      calls: record.calls ?? 1,
      cost_usd: record.costUsd ?? 0,
      batch: record.batch ?? false,
    });
    if (error) console.error(`[usage] Couldn't record ${record.feature}:`, error.message);
  } catch (err) {
    console.error(`[usage] Couldn't record ${record.feature}:`, err instanceof Error ? err.message : err);
  }
}

/** Record a Claude call from its response's usage. */
export function recordClaudeUsage(
  feature: string,
  model: string,
  usage: TokenUsage,
  extra: { userId?: string | null; conversationId?: string | null; batch?: boolean } = {},
): Promise<void> {
  return recordUsage({
    provider: "anthropic",
    feature,
    model,
    userId: extra.userId,
    conversationId: extra.conversationId,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    costUsd: usageCost(model, usage, { batch: extra.batch }),
    batch: extra.batch,
  });
}

/**
 * Record the cost of every response an Anthropic client gets from messages.create
 * (and the beta equivalent), for scripts and background jobs. The record is written
 * before the response is returned, so a script that exits right after loses nothing.
 * `userId` can be changed later with the returned setter, for scripts that work
 * through several readers.
 */
export function trackClaudeUsage<T extends Anthropic>(
  client: T,
  feature: string,
  { userId = null }: { userId?: string | null } = {},
): { client: T; setUser: (id: string | null) => void } {
  let currentUser = userId;
  const wrap = (target: { create: (...args: never[]) => unknown }) => {
    const original = target.create.bind(target) as (...args: unknown[]) => Promise<unknown>;
    (target as { create: unknown }).create = async (...args: unknown[]) => {
      const response = await original(...args);
      const r = response as { model?: string; usage?: TokenUsage } | null;
      if (r?.usage && r.model) await recordClaudeUsage(feature, r.model, r.usage, { userId: currentUser });
      return response;
    };
  };
  wrap(client.messages as unknown as { create: (...args: never[]) => unknown });
  wrap(client.beta.messages as unknown as { create: (...args: never[]) => unknown });
  return { client, setUser: (id) => (currentUser = id) };
}

// --- Job heartbeats ---

/** Record that a background job ran, and whether it worked. Never throws. */
export async function recordJobRun(job: string, outcome: { ok: boolean; error?: string }): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { data } = await db().from("job_heartbeats").select("runs, failures").eq("job", job).maybeSingle();
    const { error } = await db()
      .from("job_heartbeats")
      .upsert({
        job,
        last_run_at: now,
        ...(outcome.ok ? { last_ok_at: now } : { last_error: (outcome.error ?? "failed").slice(0, 1000), last_error_at: now }),
        runs: (data?.runs ?? 0) + 1,
        failures: (data?.failures ?? 0) + (outcome.ok ? 0 : 1),
      });
    if (error) console.error(`[usage] Couldn't record a run of ${job}:`, error.message);
  } catch (err) {
    console.error(`[usage] Couldn't record a run of ${job}:`, err instanceof Error ? err.message : err);
  }
}
