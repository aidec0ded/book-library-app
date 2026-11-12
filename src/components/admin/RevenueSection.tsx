import { Card, CardContent } from "@/components/ui/card";

/** The revenue part of /api/admin/overview (the admin_revenue database function). */
export interface Revenue {
  month: {
    payments: number;
    refunds: number;
    fees: number;
    payment_count: number;
    subscribed: number;
    canceled: number;
    disputes: number;
    failed_payments: number;
  };
  mrr: number;
  paying_readers: number;
  complimentary_readers: number;
  month_api_cost: number;
  last_30_api_cost: number;
  free_reader_cost_30: number;
  readers: {
    user_id: string;
    email: string;
    plan: string;
    paying: boolean;
    monthly_revenue: number;
    monthly_fee: number;
    cost_30: number;
  }[];
  recent: {
    id: string;
    kind: "payment" | "refund" | "dispute" | "payment_failed" | "subscribed" | "canceled";
    plan: string | null;
    amount_usd: number;
    fee_usd: number | null;
    occurred_at: string;
    details: Record<string, unknown> | null;
    email: string | null;
  }[];
  fixed_costs: { name: string; monthly_usd: number; notes: string | null }[];
  reconciliation: { day: string; stripe_usd: number; stripe_fees_usd: number; recorded_usd: number; checked_at: string }[];
  services: {
    service: string;
    memory_mb: number;
    limit_mb: number | null;
    process_mb: number | null;
    peak_mb: number;
    peak_day: string;
    started_at: string | null;
    reported_at: string;
  }[];
}

/** What a $7 monthly payment leaves after Stripe's standard card fee, until real payments exist. */
const LIST_NET_MONTHLY = 7 - (7 * 0.029 + 0.3);

const money = (v: number) => {
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  return `${sign}$${a >= 100 ? Math.round(a).toLocaleString("en-US") : a.toFixed(2)}`;
};

const KIND_LABELS: Record<Revenue["recent"][number]["kind"], string> = {
  payment: "Payment",
  refund: "Refund",
  dispute: "Dispute",
  payment_failed: "Payment failed",
  subscribed: "Subscribed",
  canceled: "Subscription ended",
};

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "bad" }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${tone === "bad" ? "text-red-700" : tone === "good" ? "text-emerald-700" : ""}`}>
        {value}
      </p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export function RevenueSection({ revenue }: { revenue: Revenue }) {
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const monthElapsed = (now.getUTCDate() - 1 + now.getUTCHours() / 24) / daysInMonth;

  const m = revenue.month;
  const netRevenue = m.payments - m.refunds - m.fees;
  const fixedMonthly = revenue.fixed_costs.reduce((n, f) => n + f.monthly_usd, 0);
  const fixedToDate = fixedMonthly * monthElapsed;
  const profit = netRevenue - revenue.month_api_cost - fixedToDate;

  // Break-even, from the last 30 days: what each paying reader leaves after Stripe and
  // their own AI cost, against fixed bills plus costs no paying reader causes
  const paying = revenue.readers.filter((r) => r.paying);
  const netPerPaying = paying.length
    ? paying.reduce((n, r) => n + r.monthly_revenue - r.monthly_fee, 0) / paying.length
    : LIST_NET_MONTHLY;
  const costPerPaid = revenue.readers.length
    ? revenue.readers.reduce((n, r) => n + r.cost_30, 0) / revenue.readers.length
    : 0;
  const paidReaderCost = revenue.readers.reduce((n, r) => n + r.cost_30, 0);
  const sharedCost = Math.max(revenue.last_30_api_cost - paidReaderCost, 0); // free readers and work for no one reader
  const marginPerReader = netPerPaying - costPerPaid;
  const breakEven = marginPerReader > 0 ? Math.ceil((fixedMonthly + sharedCost) / marginPerReader) : null;

  return (
    <div className="space-y-8">
      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Revenue and profit</h2>
            <p className="text-sm text-muted-foreground">This month so far, UTC</p>
          </div>
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            <Stat
              label="Recurring revenue"
              value={money(revenue.mrr)}
              note={`a month, from ${revenue.paying_readers} paying reader${revenue.paying_readers === 1 ? "" : "s"}` +
                (revenue.complimentary_readers ? ` (+${revenue.complimentary_readers} complimentary)` : "")}
            />
            <Stat
              label="Revenue"
              value={money(netRevenue)}
              note={`${money(m.payments)} paid` + (m.refunds ? `, ${money(m.refunds)} refunded` : "") + `, ${money(m.fees)} Stripe fees`}
            />
            <Stat
              label="Costs"
              value={money(revenue.month_api_cost + fixedToDate)}
              note={`${money(revenue.month_api_cost)} APIs, ${money(fixedToDate)} of ${money(fixedMonthly)} fixed`}
            />
            <Stat
              label="Profit"
              value={money(profit)}
              tone={profit < 0 ? "bad" : "good"}
              note={
                fixedMonthly === 0
                  ? "Add fixed bills to fixed_costs for the full picture"
                  : breakEven !== null
                    ? `Break-even at about ${breakEven} paying readers`
                    : "Paying readers cost more than they pay"
              }
            />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span>{m.subscribed} new subscriptions</span>
            <span>{m.canceled} ended</span>
            {m.failed_payments > 0 && <span className="text-amber-700">{m.failed_payments} failed payments</span>}
            {m.disputes > 0 && <span className="font-medium text-red-700">{m.disputes} disputed</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            Break-even divides fixed bills and the last 30 days' costs that no paying reader caused ({money(sharedCost)}: free
            readers and shared background work) by what a paying reader leaves after Stripe's fee and their own AI cost (
            {money(netPerPaying)} − {money(costPerPaid)} = {money(marginPerReader)}
            {paying.length ? "" : "; the $7 price until real payments come in"}).
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-4 text-lg font-semibold">Paid readers</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Reader</th>
                  <th className="pb-2 text-right font-medium">Pays a month</th>
                  <th className="pb-2 text-right font-medium">Cost, 30 days</th>
                  <th className="pb-2 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {revenue.readers.map((r) => {
                  const margin = r.monthly_revenue - r.monthly_fee - r.cost_30;
                  return (
                    <tr key={r.user_id} className="border-t">
                      <td className="max-w-[12rem] truncate py-1.5" title={r.email}>
                        {r.email}
                        {!r.paying && <span className="ml-1 text-xs text-muted-foreground">(comp)</span>}
                      </td>
                      <td className="py-1.5 text-right">{r.paying ? money(r.monthly_revenue - r.monthly_fee) : "—"}</td>
                      <td className="py-1.5 text-right">{money(r.cost_30)}</td>
                      <td className={`py-1.5 text-right ${margin < 0 ? "text-red-700" : ""}`}>{money(margin)}</td>
                    </tr>
                  );
                })}
                {revenue.readers.length === 0 && (
                  <tr><td colSpan={4} className="py-3 text-muted-foreground">No readers on a paid plan.</td></tr>
                )}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted-foreground">
              Pays a month is after Stripe's fee; an annual plan counts as a twelfth.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-4 text-lg font-semibold">Fixed costs</h2>
            {revenue.fixed_costs.length === 0 ? (
              <p className="text-sm text-muted-foreground">None entered yet. Add rows to the fixed_costs table in Supabase.</p>
            ) : (
              <ul className="space-y-1 text-sm tabular-nums">
                {revenue.fixed_costs.map((f) => (
                  <li key={f.name} className="flex justify-between gap-3 border-t py-1">
                    <span title={f.notes ?? undefined}>
                      {f.name}
                      {f.notes && <span className="ml-1 text-xs text-muted-foreground">{f.notes}</span>}
                    </span>
                    <span>{money(f.monthly_usd)}</span>
                  </li>
                ))}
                <li className="flex justify-between border-t py-1 font-medium">
                  <span>A month</span>
                  <span>{money(fixedMonthly)}</span>
                </li>
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-4 text-lg font-semibold">Recent billing</h2>
            {revenue.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments or subscriptions yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {revenue.recent.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3 border-t py-1">
                    <span className="min-w-0 truncate" title={e.email ?? undefined}>
                      <span className={e.kind === "dispute" ? "font-medium text-red-700" : e.kind === "payment_failed" ? "text-amber-700" : ""}>
                        {KIND_LABELS[e.kind]}
                      </span>
                      {e.plan && <span className="text-muted-foreground"> · {e.plan}</span>}
                      <span className="text-muted-foreground"> · {e.email ?? "unknown reader"}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {e.kind === "payment" || e.kind === "refund"
                        ? money(e.amount_usd)
                        : typeof e.details?.amount_usd === "number"
                          ? money(e.details.amount_usd)
                          : ""}
                      <span className="ml-2 text-xs text-muted-foreground">{e.occurred_at.slice(5, 10)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h2 className="mb-1 text-lg font-semibold">Recorded against Stripe</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Payments less refunds in Stripe's balance each day, against what the webhook recorded.
            </p>
            {revenue.reconciliation.length === 0 ? (
              <p className="text-sm text-muted-foreground">No days checked yet. The worker checks hourly.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-medium">Day</th>
                    <th className="pb-2 text-right font-medium">Stripe</th>
                    <th className="pb-2 text-right font-medium">Recorded</th>
                    <th className="pb-2 text-right font-medium">Fees</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {revenue.reconciliation.map((r) => {
                    const off = Math.abs(r.stripe_usd - r.recorded_usd) >= 1;
                    return (
                      <tr key={r.day} className="border-t">
                        <td className="py-1.5">{r.day}</td>
                        <td className="py-1.5 text-right">{money(r.stripe_usd)}</td>
                        <td className={`py-1.5 text-right ${off ? "font-medium text-red-700" : ""}`}>{money(r.recorded_usd)}</td>
                        <td className="py-1.5 text-right text-muted-foreground">{money(r.stripe_fees_usd)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
