import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { RevenueSection, type Revenue } from "@/components/admin/RevenueSection";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The owner's telemetry page: what the app costs, who uses it, quotas, and whether
 * background jobs run. Data comes from /api/admin/overview, which only answers for
 * accounts in ADMIN_USER_IDS; everyone else sees "not found".
 */

interface DailyCost {
  day: string;
  provider: string;
  feature: string;
  cost: number;
  calls: number;
  tokens: number;
}

interface DailyActivity {
  day: string;
  signups: number;
  chat_messages: number;
  chatting_readers: number;
  books_added: Record<string, number>;
}

interface JobHeartbeat {
  job: string;
  last_run_at: string;
  last_ok_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  runs: number;
  failures: number;
}

interface Overview {
  generated_at: string;
  days: number;
  daily_costs: DailyCost[];
  reader_costs: { user_id: string; email: string; cost: number; chat_calls: number }[];
  daily_activity: DailyActivity[];
  spend_today: Record<string, number>;
  spend_month: Record<string, number>;
  totals: {
    readers: number;
    readers_signed_in_7d: number;
    readers_chatting_7d: number;
    paid_readers: number;
    curating_readers: number;
    books: number;
    books_waiting_for_details: number;
  };
  quotas: {
    isbndb: { remaining: number; resets_at: string; updated_at: string } | null;
    isbndb_calls_today: number;
    voyage_tokens_total: number;
    database_bytes: number;
  };
  jobs: JobHeartbeat[];
  limits: {
    daily_chat_budget_usd: number;
    chat_spent_today_usd: number;
    paid_monthly_reply_cap: number;
    isbndb_daily_quota: number;
    isbndb_background_reserve: number;
    voyage_free_tokens: number;
    database_included_bytes: number;
  };
  jobs_in_worker: boolean;
  reconciliation: {
    day: string;
    workspace: "chat" | "jobs" | "other";
    workspace_name: string | null;
    anthropic_usd: number;
    recorded_usd: number;
  }[];
  revenue: Revenue;
}

/** How often each scheduler should report; three missed intervals counts as stalled. */
const JOB_INTERVALS_MIN: Record<string, number> = {
  enrichment_check: 5,
  conversation_review: 10,
  embeddings: 10,
  profile_check: 240,
  releases_check: 240,
  cost_reconciliation: 60,
  stripe_reconciliation: 60,
};

const JOB_LABELS: Record<string, string> = {
  enrichment_check: "Enrichment and tagging (scheduler)",
  conversation_review: "Conversation review",
  embeddings: "Book embeddings",
  profile_check: "Profiles (scheduler)",
  releases_check: "Releases (scheduler)",
  "enrich-isbndb": "ISBNdb enrichment",
  "discover-isbns": "ISBN discovery",
  "tag-vibes": "Vibe tagging",
  "tag-classifications": "Classification tagging",
  "predict-ratings": "Predicted ratings",
  "generate-profile": "Profile generation",
  "ingest-releases": "Release ingestion",
  "triage-releases": "Release triage",
  "score-releases": "Release scoring",
  cost_reconciliation: "Daily cost check",
  stripe_reconciliation: "Daily Stripe check",
};

const FEATURE_LABELS: Record<string, string> = {
  chat: "Chat replies",
  title: "Conversation titles",
  greeting: "Home greetings",
  condense: "Condensing long chats",
  review: "Conversation review",
  profile: "Reader profiles",
  predicted_ratings: "Predicted ratings",
  vibe_tagging: "Vibe tagging",
  classification_tagging: "Classification tagging",
  genre_reclassify: "Genre reclassification",
  release_triage: "Release triage",
  release_scoring: "Release scoring",
  book_embeddings: "Book embeddings",
  search_by_meaning: "Search by meaning",
  isbndb_lookup: "ISBNdb lookups",
  isbndb_search: "ISBNdb searches",
};

const GROUPS = [
  { key: "chat", label: "Chat", className: "fill-foreground", swatch: "bg-foreground" },
  { key: "background", label: "Background AI", className: "fill-accent", swatch: "bg-accent" },
  { key: "voyage", label: "Embeddings", className: "fill-muted-foreground/50", swatch: "bg-muted-foreground/50" },
] as const;

const CHAT_FEATURES = new Set(["chat", "title", "greeting", "condense"]);
const groupOf = (c: DailyCost) =>
  c.provider === "anthropic" ? (CHAT_FEATURES.has(c.feature) ? "chat" : "background") : c.provider;

const money = (v: number) => (v >= 100 ? `$${Math.round(v).toLocaleString("en-US")}` : `$${v.toFixed(2)}`);
const count = (v: number) => v.toLocaleString("en-US");
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
};

function Meter({ label, used, limit, detail }: { label: string; used: number; limit: number; detail: string }) {
  const share = limit > 0 ? Math.min(used / limit, 1) : 0;
  const tone = share >= 0.9 ? "bg-red-600" : share >= 0.7 ? "bg-amber-500" : "bg-foreground/70";
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{detail}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(share * 100, 1)}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** Stacked daily bars, one per day, drawn to a single scale. */
function DailyCostChart({ costs, days }: { costs: DailyCost[]; days: string[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const perDay = days.map((day) => {
    const totals: Record<string, number> = {};
    for (const c of costs) if (c.day === day) totals[groupOf(c)] = (totals[groupOf(c)] ?? 0) + c.cost;
    return totals;
  });
  const max = Math.max(0.01, ...perDay.map((t) => Object.values(t).reduce((a, b) => a + b, 0)));
  const W = 720, H = 180, L = 44, B = 22, T = 8;
  const slot = (W - L) / days.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, max / 2, max];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily cost by area">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {money(t)}
            </text>
          </g>
        ))}
        {perDay.map((totals, i) => {
          let top = 0;
          const x = L + slot * i + slot * 0.15;
          const w = Math.max(slot * 0.7, 1);
          return (
            <g key={days[i]} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={L + slot * i} y={T} width={slot} height={H - T - B} className="fill-transparent" />
              {GROUPS.map((g) => {
                const v = totals[g.key] ?? 0;
                if (v <= 0) return null;
                const y1 = y(top + v), y0 = y(top);
                top += v;
                return <rect key={g.key} x={x} y={y1} width={w} height={Math.max(y0 - y1, 1)} className={g.className} />;
              })}
              {(i === 0 || i === days.length - 1 || i % Math.ceil(days.length / 6) === 0) && (
                <text x={x + w / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {days[i]?.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-md border bg-card px-3 py-2 text-xs shadow-sm">
          <p className="mb-1 font-medium">{days[hover]}</p>
          {GROUPS.map((g) => (
            <p key={g.key} className="tabular-nums text-muted-foreground">
              {g.label}: {money(perDay[hover]?.[g.key] ?? 0)}
            </p>
          ))}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {GROUPS.map((g) => (
          <span key={g.key} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${g.swatch}`} />
            {g.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function jobStatus(job: JobHeartbeat): { label: string; className: string } {
  if (job.last_error_at && (!job.last_ok_at || job.last_error_at > job.last_ok_at)) {
    return { label: "Failing", className: "bg-red-100 text-red-800" };
  }
  const interval = JOB_INTERVALS_MIN[job.job];
  if (interval && Date.now() - new Date(job.last_run_at).getTime() > interval * 3 * 60000) {
    return { label: "Stalled", className: "bg-amber-100 text-amber-800" };
  }
  return { label: "OK", className: "bg-emerald-100 text-emerald-800" };
}

export function AdminPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Overview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState("loading");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/overview?days=${days}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (cancelled) return;
      if (res.status === 404 || res.status === 401) return setState("forbidden");
      if (!res.ok) {
        setError(`The server answered ${res.status}.`);
        return setState("error");
      }
      setData((await res.json()) as Overview);
      setState("ready");
    })().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : String(err));
        setState("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const dayList = useMemo(() => data?.daily_activity.map((d) => d.day) ?? [], [data]);

  const byFeature = useMemo(() => {
    const rows = new Map<string, { feature: string; provider: string; calls: number; tokens: number; cost: number }>();
    for (const c of data?.daily_costs ?? []) {
      const key = `${c.provider}:${c.feature}`;
      const row = rows.get(key) ?? { feature: c.feature, provider: c.provider, calls: 0, tokens: 0, cost: 0 };
      row.calls += c.calls;
      row.tokens += c.tokens;
      row.cost += c.cost;
      rows.set(key, row);
    }
    return [...rows.values()].sort((a, b) => b.cost - a.cost || b.calls - a.calls);
  }, [data]);

  const booksBySource = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const d of data?.daily_activity ?? []) {
      for (const [source, n] of Object.entries(d.books_added)) totals[source] = (totals[source] ?? 0) + n;
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]);
  }, [data]);

  if (state === "forbidden") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold">Page not found</h1>
      </div>
    );
  }

  const windowTotal = byFeature.reduce((n, r) => n + r.cost, 0);
  const monthTotal = Object.values(data?.spend_month ?? {}).reduce((a, b) => a + b, 0);
  const now = new Date();
  const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate();
  const projected = monthTotal / Math.max(now.getUTCDate() - 1 + now.getUTCHours() / 24, 0.5) * daysInMonth;
  const activityTotals = (data?.daily_activity ?? []).reduce(
    (t, d) => ({ signups: t.signups + d.signups, messages: t.messages + d.chat_messages }),
    { signups: 0, messages: 0 },
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight">Telemetry</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `Updated ${ago(data.generated_at)} · background jobs run in the ${data.jobs_in_worker ? "worker" : "web server"}` : "Loading…"}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm" role="group" aria-label="Period">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1.5 ${days === d ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      {state === "error" && <p className="text-sm text-red-600">Couldn't load telemetry: {error}</p>}

      {data && (
        <>
          <Card>
            <CardContent className="grid grid-cols-2 gap-6 pt-6 md:grid-cols-4">
              <Stat
                label="Spent today"
                value={money(Object.values(data.spend_today).reduce((a, b) => a + b, 0))}
                note={`Chat ${money(data.limits.chat_spent_today_usd)} of the ${money(data.limits.daily_chat_budget_usd)} daily stop`}
              />
              <Stat label="This month" value={money(monthTotal)} note={`On track for about ${money(projected)}`} />
              <Stat
                label="Readers"
                value={count(data.totals.readers)}
                note={`${data.totals.readers_signed_in_7d} signed in, ${data.totals.readers_chatting_7d} chatted this week`}
              />
              <Stat
                label="Books"
                value={count(data.totals.books)}
                note={`${data.totals.books_waiting_for_details} waiting for details`}
              />
            </CardContent>
          </Card>

          <RevenueSection revenue={data.revenue} />

          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">Daily cost</h2>
                <p className="text-sm text-muted-foreground">{money(windowTotal)} over {days} days</p>
              </div>
              <DailyCostChart costs={data.daily_costs} days={dayList} />
            </CardContent>
          </Card>

          <div className="grid gap-8 md:grid-cols-2">
            <Card>
              <CardContent className="pt-6">
                <h2 className="mb-4 text-lg font-semibold">Cost by feature</h2>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-2 font-medium">Feature</th>
                      <th className="pb-2 text-right font-medium">Calls</th>
                      <th className="pb-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {byFeature.map((r) => (
                      <tr key={`${r.provider}:${r.feature}`} className="border-t">
                        <td className="py-1.5">{FEATURE_LABELS[r.feature] ?? r.feature}</td>
                        <td className="py-1.5 text-right">{count(r.calls)}</td>
                        <td className="py-1.5 text-right">{r.provider === "isbndb" ? "plan" : money(r.cost)}</td>
                      </tr>
                    ))}
                    {byFeature.length === 0 && (
                      <tr><td colSpan={3} className="py-3 text-muted-foreground">Nothing recorded yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <h2 className="mb-4 text-lg font-semibold">Cost per reader</h2>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-2 font-medium">Reader</th>
                      <th className="pb-2 text-right font-medium">Replies</th>
                      <th className="pb-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {data.reader_costs.map((r) => (
                      <tr key={r.user_id} className="border-t">
                        <td className="max-w-[14rem] truncate py-1.5" title={r.email}>{r.email}</td>
                        <td className="py-1.5 text-right">{count(r.chat_calls)}</td>
                        <td className="py-1.5 text-right">{money(r.cost)}</td>
                      </tr>
                    ))}
                    {data.reader_costs.length === 0 && (
                      <tr><td colSpan={3} className="py-3 text-muted-foreground">No reader costs in this period.</td></tr>
                    )}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-muted-foreground">
                  Replies counts API calls for chat; a reply with tool use makes several.
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <h2 className="text-lg font-semibold">Activity, last {days} days</h2>
                <div className="grid grid-cols-3 gap-4">
                  <Stat label="Signups" value={count(activityTotals.signups)} />
                  <Stat label="Messages" value={count(activityTotals.messages)} />
                  <Stat label="Paid" value={count(data.totals.paid_readers)} note={`${data.totals.curating_readers} curating releases`} />
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Books added</p>
                  {booksBySource.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None in this period.</p>
                  ) : (
                    <ul className="space-y-1 text-sm tabular-nums">
                      {booksBySource.map(([source, n]) => (
                        <li key={source} className="flex justify-between border-t py-1">
                          <span>
                            {{ import: "Goodreads import", search: "Add Book", chat: "Added by the AI", release: "From Releases", unknown: "Before tracking" }[source] ?? source}
                          </span>
                          <span>{count(n)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-5 pt-6">
                <h2 className="text-lg font-semibold">Limits and quotas</h2>
                <Meter
                  label="Chat spend today"
                  used={data.limits.chat_spent_today_usd}
                  limit={data.limits.daily_chat_budget_usd}
                  detail={`${money(data.limits.chat_spent_today_usd)} of ${money(data.limits.daily_chat_budget_usd)}`}
                />
                <Meter
                  label="ISBNdb calls today"
                  used={data.limits.isbndb_daily_quota - (data.quotas.isbndb?.remaining ?? data.limits.isbndb_daily_quota)}
                  limit={data.limits.isbndb_daily_quota}
                  detail={
                    data.quotas.isbndb
                      ? `${count(data.quotas.isbndb.remaining)} left, background stops at ${count(data.limits.isbndb_background_reserve)}`
                      : "no calls yet today"
                  }
                />
                <Meter
                  label="Voyage free tokens"
                  used={data.quotas.voyage_tokens_total}
                  limit={data.limits.voyage_free_tokens}
                  detail={`${(data.quotas.voyage_tokens_total / 1e6).toFixed(1)}M of 200M`}
                />
                <Meter
                  label="Database"
                  used={data.quotas.database_bytes}
                  limit={data.limits.database_included_bytes}
                  detail={`${(data.quotas.database_bytes / 1024 ** 2).toFixed(0)}MB of 8GB included`}
                />
                {data.revenue.services.map((svc) => {
                  const limit = svc.limit_mb ?? 512;
                  const stale = Date.now() - new Date(svc.reported_at).getTime() > 20 * 60 * 1000;
                  return (
                    <Meter
                      key={svc.service}
                      label={svc.service === "web" ? "Web server memory" : "Worker memory"}
                      used={svc.memory_mb}
                      limit={limit}
                      detail={
                        stale
                          ? `not reporting since ${ago(svc.reported_at)}`
                          : `${Math.round(svc.memory_mb)}MB of ${Math.round(limit)}MB, peak today ${Math.round(svc.peak_mb)}MB`
                      }
                    />
                  );
                })}
                {data.revenue.services.length === 0 && (
                  <p className="text-xs text-muted-foreground">Server memory appears here once each Render service has reported (every 5 minutes).</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-1 text-lg font-semibold">Recorded against billed</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                What Anthropic billed each day against what the app recorded. A gap means calls the app didn't record.
              </p>
              {data.reconciliation.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No days checked yet. The worker checks hourly once ANTHROPIC_ADMIN_API_KEY is set, after Anthropic finishes counting a day.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="pb-2 font-medium">Day</th>
                        <th className="pb-2 font-medium">Workspace</th>
                        <th className="pb-2 text-right font-medium">Billed</th>
                        <th className="pb-2 text-right font-medium">Recorded</th>
                        <th className="pb-2 text-right font-medium">Gap</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {data.reconciliation
                        .filter((r) => Number(r.anthropic_usd) > 0 || Number(r.recorded_usd) > 0)
                        .map((r) => {
                          const gap = Number(r.anthropic_usd) - Number(r.recorded_usd);
                          const off = Math.abs(gap) >= Math.max(0.5, Number(r.anthropic_usd) * 0.15);
                          return (
                            <tr key={`${r.day}:${r.workspace}`} className="border-t">
                              <td className="py-1.5">{r.day}</td>
                              <td className="py-1.5">
                                {{ chat: "Chat", jobs: "Background jobs", other: "Other" }[r.workspace]}
                                {r.workspace === "other" && r.workspace_name ? ` (${r.workspace_name})` : ""}
                              </td>
                              <td className="py-1.5 text-right">{money(Number(r.anthropic_usd))}</td>
                              <td className="py-1.5 text-right">{money(Number(r.recorded_usd))}</td>
                              <td className={`py-1.5 text-right ${off ? "font-medium text-red-700" : "text-muted-foreground"}`}>
                                {gap >= 0 ? "+" : "−"}{money(Math.abs(gap))}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-4 text-lg font-semibold">Background jobs</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-2 font-medium">Job</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Last run</th>
                      <th className="pb-2 text-right font-medium">Runs</th>
                      <th className="pb-2 text-right font-medium">Failures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.jobs.map((j) => {
                      const status = jobStatus(j);
                      return (
                        <tr key={j.job} className="border-t align-top">
                          <td className="py-1.5">{JOB_LABELS[j.job] ?? j.job}</td>
                          <td className="py-1.5">
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${status.className}`} title={j.last_error ?? undefined}>
                              {status.label}
                            </span>
                          </td>
                          <td className="py-1.5 text-muted-foreground">{ago(j.last_run_at)}</td>
                          <td className="py-1.5 text-right tabular-nums">{count(j.runs)}</td>
                          <td className="py-1.5 text-right tabular-nums">{count(j.failures)}</td>
                        </tr>
                      );
                    })}
                    {data.jobs.length === 0 && (
                      <tr><td colSpan={5} className="py-3 text-muted-foreground">No job has reported yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
