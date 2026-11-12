import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../scripts/fetch-all.js";
import { CHAT_FEATURES } from "./spend-guard.js";
import { recordJobRun } from "./usage.js";

/**
 * Once an hour, the worker compares the last few complete UTC days of what Anthropic
 * billed (its Usage and Cost Analytics API, read with ANTHROPIC_ADMIN_API_KEY) with
 * what the app recorded in api_usage, per workspace, and keeps the result in
 * cost_reconciliation. A gap means calls the app didn't record: a script that bypasses
 * the tracked client, a key used somewhere else, or local testing.
 *
 * Workspaces are matched by name: "chat" in the name is the chat key's workspace,
 * "background" or "jobs" the background key's, and anything else counts as "other".
 * Claude Code workspaces are left out: that's development, not the app.
 */

const API = "https://api.anthropic.com/v1/organizations";
const HEADERS_BASE = { "anthropic-version": "2026-10-21" };
const DAYS_TO_CHECK = 3;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const STARTUP_DELAY_MS = 5 * 60 * 1000;

type WorkspaceClass = "chat" | "jobs" | "other" | "skip";

function classify(name: string): WorkspaceClass {
  if (/claude code/i.test(name)) return "skip";
  if (/chat/i.test(name)) return "chat";
  if (/background|jobs/i.test(name)) return "jobs";
  return "other";
}

async function anthropicGet<T>(path: string, beta?: string): Promise<T> {
  const key = process.env.ANTHROPIC_ADMIN_API_KEY;
  if (!key) throw new Error("ANTHROPIC_ADMIN_API_KEY is not set");
  const res = await fetch(`${API}${path}`, {
    headers: { ...HEADERS_BASE, "x-api-key": key, ...(beta && { "anthropic-beta": beta }) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Anthropic ${path.split("?")[0]} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

async function workspaceNames(): Promise<Map<string, string>> {
  const body = await anthropicGet<{ data: { id: string; name: string }[] }>("/workspaces?limit=100");
  return new Map(body.data.map((w) => [w.id, w.name]));
}

interface CostRow {
  group: { workspace_id: string | null };
  cost: { amount: string };
}

/** Anthropic's cost for one UTC day by workspace, in dollars, and when its data was last refreshed. */
async function anthropicCosts(day: string): Promise<{ byWorkspace: Map<string, number>; refreshedAt: string | null }> {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const base =
    `/analytics/cost?starting_at=${day}T00:00:00Z&ending_at=${next.toISOString().slice(0, 10)}T00:00:00Z` +
    `&time_bucket_width=1d&group_by[]=workspace_id&limit=1000`;
  const byWorkspace = new Map<string, number>();
  let refreshedAt: string | null = null;
  let page: string | null = null;
  do {
    const body: { data: CostRow[]; has_more: boolean; next_page: string | null; data_refreshed_at: string | null } =
      await anthropicGet(page ? `${base}&page=${encodeURIComponent(page)}` : base, "analytics-usage-cost-2026-08-24");
    refreshedAt = body.data_refreshed_at;
    for (const row of body.data) {
      const id = row.group.workspace_id ?? "default";
      // Amounts are strings in cents
      byWorkspace.set(id, (byWorkspace.get(id) ?? 0) + Number(row.cost.amount) / 100);
    }
    page = body.has_more ? body.next_page : null;
  } while (page);
  return { byWorkspace, refreshedAt };
}

/** What the app recorded for Anthropic calls on one UTC day, split as the workspaces are. */
async function recordedCosts(service: SupabaseClient, day: string): Promise<{ chat: number; jobs: number }> {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const rows = await fetchAllRows<{ feature: string; cost_usd: number }>((from, to) =>
    service
      .from("api_usage")
      .select("feature, cost_usd")
      .eq("provider", "anthropic")
      .gte("created_at", `${day}T00:00:00Z`)
      .lt("created_at", next.toISOString())
      .order("id")
      .range(from, to),
  );
  const totals = { chat: 0, jobs: 0 };
  for (const r of rows) totals[CHAT_FEATURES.includes(r.feature) ? "chat" : "jobs"] += Number(r.cost_usd);
  return totals;
}

/** Check the last few complete days, skipping any Anthropic hasn't finished counting. */
export async function reconcileRecentDays(service: SupabaseClient): Promise<number> {
  const names = await workspaceNames();
  let checked = 0;
  for (let back = 1; back <= DAYS_TO_CHECK; back++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - back);
    const day = d.toISOString().slice(0, 10);
    const { byWorkspace, refreshedAt } = await anthropicCosts(day);
    const dayEnd = new Date(`${day}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000;
    if (!refreshedAt || new Date(refreshedAt).getTime() < dayEnd) continue; // not counted yet

    const billed = { chat: 0, jobs: 0, other: 0 };
    const otherNames: string[] = [];
    for (const [id, usd] of byWorkspace) {
      const name = names.get(id) ?? (id === "default" ? "Default" : id);
      const cls = classify(name);
      if (cls === "skip") continue;
      billed[cls] += usd;
      if (cls === "other" && usd > 0) otherNames.push(name);
    }
    const recorded = await recordedCosts(service, day);
    const now = new Date().toISOString();
    const rows = [
      { day, workspace: "chat", workspace_name: [...names.values()].find((n) => classify(n) === "chat") ?? null, anthropic_usd: billed.chat, recorded_usd: recorded.chat, checked_at: now },
      { day, workspace: "jobs", workspace_name: [...names.values()].find((n) => classify(n) === "jobs") ?? null, anthropic_usd: billed.jobs, recorded_usd: recorded.jobs, checked_at: now },
      { day, workspace: "other", workspace_name: otherNames.join(", ") || null, anthropic_usd: billed.other, recorded_usd: 0, checked_at: now },
    ];
    const { error } = await service.from("cost_reconciliation").upsert(rows, { onConflict: "day,workspace" });
    if (error) throw error;
    checked++;
  }
  return checked;
}

/** Hourly in the worker. Does nothing without an Admin API key. */
export function startCostReconciliation(service: SupabaseClient): void {
  if (!process.env.ANTHROPIC_ADMIN_API_KEY) {
    console.log("[reconcile] ANTHROPIC_ADMIN_API_KEY not set; skipping the daily cost check.");
    return;
  }
  const run = async () => {
    try {
      const checked = await reconcileRecentDays(service);
      await recordJobRun("cost_reconciliation", { ok: true });
      if (checked > 0) console.log(`[reconcile] Checked ${checked} day(s) against Anthropic's figures.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[reconcile] Failed:", message);
      await recordJobRun("cost_reconciliation", { ok: false, error: message });
    }
  };
  console.log(`[reconcile] Will check in ${STARTUP_DELAY_MS / 60000}min, then hourly.`);
  setTimeout(() => {
    void run();
    setInterval(() => void run(), CHECK_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}
