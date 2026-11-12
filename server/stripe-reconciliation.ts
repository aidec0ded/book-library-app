import type { SupabaseClient } from "@supabase/supabase-js";
import { stripeClient } from "./stripe-handler.js";
import { recordJobRun } from "./usage.js";

/**
 * Once an hour, the worker compares the last 3 UTC days of Stripe's balance
 * (charges less refunds, and Stripe's fees) with what the webhook recorded in
 * billing_events, into stripe_reconciliation. A gap means a webhook that didn't
 * arrive or failed. Stripe's balance updates as payments happen, so a day can be
 * checked as soon as it's over.
 */

const DAYS_TO_CHECK = 3;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const STARTUP_DELAY_MS = 6 * 60 * 1000;
/** Balance transaction types that are money from readers: payments and their refunds. */
const REVENUE_TYPES = new Set(["charge", "payment", "refund", "payment_refund"]);

export async function reconcileStripeDays(service: SupabaseClient): Promise<number> {
  const stripe = stripeClient();
  let checked = 0;
  for (let back = 1; back <= DAYS_TO_CHECK; back++) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - back);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const day = start.toISOString().slice(0, 10);

    let revenue = 0;
    let fees = 0;
    for await (const txn of stripe.balanceTransactions.list({
      created: { gte: start.getTime() / 1000, lt: end.getTime() / 1000 },
      limit: 100,
    })) {
      if (REVENUE_TYPES.has(txn.type)) revenue += txn.amount;
      fees += txn.fee;
    }

    const { data, error } = await service
      .from("billing_events")
      .select("amount_usd")
      .in("kind", ["payment", "refund"])
      .gte("occurred_at", start.toISOString())
      .lt("occurred_at", end.toISOString());
    if (error) throw error;
    const recorded = (data ?? []).reduce((n, r) => n + Number(r.amount_usd), 0);

    const { error: upsertError } = await service.from("stripe_reconciliation").upsert(
      {
        day,
        stripe_usd: revenue / 100,
        stripe_fees_usd: fees / 100,
        recorded_usd: Math.round(recorded * 100) / 100,
        checked_at: new Date().toISOString(),
      },
      { onConflict: "day" },
    );
    if (upsertError) throw upsertError;
    checked++;
  }
  return checked;
}

/** Hourly in the worker. Does nothing without a Stripe key. */
export function startStripeReconciliation(service: SupabaseClient): void {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log("[stripe-check] STRIPE_SECRET_KEY not set; skipping the daily Stripe check.");
    return;
  }
  const run = async () => {
    try {
      await reconcileStripeDays(service);
      await recordJobRun("stripe_reconciliation", { ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[stripe-check] Failed:", message);
      await recordJobRun("stripe_reconciliation", { ok: false, error: message });
    }
  };
  console.log(`[stripe-check] Will check in ${STARTUP_DELAY_MS / 60000}min, then hourly.`);
  setTimeout(() => {
    void run();
    setInterval(() => void run(), CHECK_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}
