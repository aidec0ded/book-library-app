import Stripe from "stripe";
import { type SupabaseClient } from "@supabase/supabase-js";
import { FREE_PERIOD_ENDS } from "./subscription.js";

/**
 * Stripe: the webhook (subscriptions, payments, refunds, disputes), Checkout, and the
 * customer portal. Every payment, refund, and dispute is also written to
 * billing_events (migration 036) for the telemetry page and alerts.
 *
 * The API version matches the webhook endpoint's in the Stripe dashboard, so the
 * events it sends have the shape this code reads. Since the 2025 "basil" versions,
 * a subscription's period is on its items and an invoice's subscription is under
 * parent.subscription_details.
 */
export const STRIPE_API_VERSION = "2026-01-28.clover";

let client: Stripe | null = null;
/** Created on first use, so a process without STRIPE_SECRET_KEY can still import this file. */
export function stripeClient(): Stripe {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: STRIPE_API_VERSION });
  return client;
}

/**
 * Map Stripe subscription status to our internal status.
 */
function mapStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "incomplete_expired":
      return "expired";
    default:
      return "active";
  }
}

/**
 * Map Stripe price ID to our plan name.
 */
function mapPlan(priceId: string | undefined): "monthly" | "annual" {
  if (priceId && priceId === process.env.STRIPE_ANNUAL_PRICE_ID) return "annual";
  return "monthly";
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const dollars = (cents: number) => Math.round(cents) / 100;
const idOf = (ref: string | { id: string } | null | undefined) => (typeof ref === "string" ? ref : ref?.id ?? null);

/** The current billing period, which now lives on the subscription's item. */
function subscriptionPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  return {
    current_period_start: item ? iso(item.current_period_start) : null,
    current_period_end: item ? iso(item.current_period_end) : null,
  };
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return idOf(invoice.parent?.subscription_details?.subscription);
}

/** The reader a Stripe customer belongs to: their subscription row, or the customer's metadata. */
async function userForCustomer(customerId: string | null, supabase: SupabaseClient): Promise<string | null> {
  if (!customerId) return null;
  const { data } = await supabase
    .from("user_subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (data) return data.user_id as string;
  try {
    const customer = await stripeClient().customers.retrieve(customerId);
    if (!customer.deleted) return customer.metadata?.user_id ?? null;
  } catch (err) {
    console.error("[stripe] Couldn't look up customer", customerId, err instanceof Error ? err.message : err);
  }
  return null;
}

interface BillingEvent {
  id: string;
  kind: "payment" | "refund" | "dispute" | "payment_failed" | "subscribed" | "canceled";
  user_id: string | null;
  stripe_customer_id: string | null;
  plan?: string | null;
  amount_usd?: number;
  fee_usd?: number | null;
  occurred_at: string;
  details?: Record<string, unknown>;
}

/** Record a billing event. Stripe can send an event more than once, so it's keyed by Stripe's id. */
async function recordBillingEvent(event: BillingEvent, supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.from("billing_events").upsert(event, { onConflict: "id" });
  if (error) throw new Error(`billing_events: ${error.message}`);
}

/** Stripe's fee on an invoice's payment, from the charge's balance transaction. Null if it can't be found. */
async function invoiceFee(invoiceId: string): Promise<number | null> {
  const stripe = stripeClient();
  try {
    const payments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 10 });
    let fee = 0;
    let found = false;
    for (const p of payments.data) {
      if (p.status !== "paid") continue;
      let charge: Stripe.Charge | null = null;
      if (p.payment.type === "payment_intent" && p.payment.payment_intent) {
        const intent = await stripe.paymentIntents.retrieve(idOf(p.payment.payment_intent)!, {
          expand: ["latest_charge.balance_transaction"],
        });
        charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null;
      } else if (p.payment.type === "charge" && p.payment.charge) {
        charge = await stripe.charges.retrieve(idOf(p.payment.charge)!, { expand: ["balance_transaction"] });
      }
      const txn = charge?.balance_transaction;
      if (txn && typeof txn === "object") {
        fee += txn.fee;
        found = true;
      }
    }
    return found ? dollars(fee) : null;
  } catch (err) {
    console.error("[stripe] Couldn't read the fee for", invoiceId, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Handle Stripe webhook events.
 * Called with the raw body (Buffer) for signature verification.
 */
export async function handleStripeWebhook(
  rawBody: Buffer,
  signature: string,
  supabase: SupabaseClient,
): Promise<{ status: number; body: string }> {
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[stripe] Webhook signature verification failed:", msg);
    return { status: 400, body: `Webhook Error: ${msg}` };
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object, supabase);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object, supabase);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object, supabase);
        break;
      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object, supabase);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object, supabase);
        break;
      case "charge.refunded":
        await handleChargeRefunded(event.data.object, supabase);
        break;
      case "charge.dispute.created":
        await handleDisputeCreated(event.data.object, supabase);
        break;
      default:
        // Unhandled event type — ignore
        break;
    }
  } catch (err) {
    console.error(`[stripe] Error handling ${event.type}:`, err);
    return { status: 500, body: "Webhook handler error" };
  }

  return { status: 200, body: "ok" };
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  supabase: SupabaseClient,
): Promise<void> {
  const userId = session.metadata?.user_id;
  if (!userId) {
    console.error("[stripe] checkout.session.completed missing user_id metadata");
    return;
  }

  // Retrieve subscription details
  const subscription = await stripeClient().subscriptions.retrieve(idOf(session.subscription)!);
  const plan = mapPlan(subscription.items.data[0]?.price.id);
  const customerId = idOf(session.customer);

  const { error } = await supabase.from("user_subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      plan,
      status: mapStatus(subscription.status),
      ...subscriptionPeriod(subscription),
      cancel_at_period_end: subscription.cancel_at_period_end,
      chat_messages_used: 0,
      chat_messages_period_start: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`user_subscriptions: ${error.message}`);

  await recordBillingEvent(
    {
      id: `subscribed:${subscription.id}`,
      kind: "subscribed",
      user_id: userId,
      stripe_customer_id: customerId,
      plan,
      occurred_at: iso(subscription.created),
    },
    supabase,
  );

  // A payment recorded before this (its webhook can arrive first) gets its reader now
  await supabase.from("billing_events").update({ user_id: userId }).eq("stripe_customer_id", customerId).is("user_id", null);

  console.log(`[stripe] Checkout completed for user ${userId}, plan: ${plan}`);
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  supabase: SupabaseClient,
): Promise<void> {
  const plan = mapPlan(subscription.items.data[0]?.price.id);

  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      plan,
      status: mapStatus(subscription.status),
      ...subscriptionPeriod(subscription),
      cancel_at_period_end: subscription.cancel_at_period_end,
    })
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    console.error("[stripe] subscription.updated DB error:", error);
  }
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabase: SupabaseClient,
): Promise<void> {
  const customerId = idOf(subscription.customer);
  const { data: row } = await supabase
    .from("user_subscriptions")
    .select("user_id, plan")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      plan: "free",
      status: "canceled",
      stripe_subscription_id: null,
      cancel_at_period_end: false,
    })
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    console.error("[stripe] subscription.deleted DB error:", error);
  }

  await recordBillingEvent(
    {
      id: `canceled:${subscription.id}`,
      kind: "canceled",
      user_id: (row?.user_id as string | undefined) ?? (await userForCustomer(customerId, supabase)),
      stripe_customer_id: customerId,
      plan: (row?.plan as string | undefined) ?? mapPlan(subscription.items.data[0]?.price.id),
      occurred_at: iso(subscription.ended_at ?? subscription.canceled_at ?? Math.floor(Date.now() / 1000)),
      details: { reason: subscription.cancellation_details?.reason ?? null },
    },
    supabase,
  );
}

async function handlePaymentSucceeded(
  invoice: Stripe.Invoice,
  supabase: SupabaseClient,
): Promise<void> {
  const subscriptionId = invoiceSubscriptionId(invoice);

  // Reset monthly message counter on successful renewal
  if (subscriptionId) {
    const { error } = await supabase
      .from("user_subscriptions")
      .update({
        chat_messages_used: 0,
        chat_messages_period_start: new Date().toISOString(),
        status: "active",
      })
      .eq("stripe_subscription_id", subscriptionId);

    if (error) {
      console.error("[stripe] payment_succeeded DB error:", error);
    }
  }

  if (invoice.amount_paid <= 0) return; // nothing charged (a free invoice)
  const customerId = idOf(invoice.customer);
  const priceId = idOf(invoice.lines.data[0]?.pricing?.price_details?.price);
  await recordBillingEvent(
    {
      id: invoice.id!,
      kind: "payment",
      user_id: invoice.parent?.subscription_details?.metadata?.user_id ?? (await userForCustomer(customerId, supabase)),
      stripe_customer_id: customerId,
      plan: priceId ? mapPlan(priceId) : null,
      amount_usd: dollars(invoice.amount_paid),
      fee_usd: await invoiceFee(invoice.id!),
      occurred_at: iso(invoice.status_transitions?.paid_at ?? invoice.created),
      details: { billing_reason: invoice.billing_reason, subscription: subscriptionId },
    },
    supabase,
  );
}

async function handlePaymentFailed(
  invoice: Stripe.Invoice,
  supabase: SupabaseClient,
): Promise<void> {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (subscriptionId) {
    const { error } = await supabase
      .from("user_subscriptions")
      .update({ status: "past_due" })
      .eq("stripe_subscription_id", subscriptionId);

    if (error) {
      console.error("[stripe] payment_failed DB error:", error);
    }
  }

  const customerId = idOf(invoice.customer);
  await recordBillingEvent(
    {
      // One row per attempt, so Stripe's retries show
      id: `failed:${invoice.id}:${invoice.attempt_count}`,
      kind: "payment_failed",
      user_id: await userForCustomer(customerId, supabase),
      stripe_customer_id: customerId,
      occurred_at: new Date().toISOString(),
      details: {
        amount_usd: dollars(invoice.amount_due),
        attempt: invoice.attempt_count,
        next_attempt: invoice.next_payment_attempt ? iso(invoice.next_payment_attempt) : null,
      },
    },
    supabase,
  );
}

/** Each refund on the charge is its own row, so partial refunds on different days add up correctly. */
async function handleChargeRefunded(charge: Stripe.Charge, supabase: SupabaseClient): Promise<void> {
  const customerId = idOf(charge.customer);
  const userId = await userForCustomer(customerId, supabase);
  const refunds = await stripeClient().refunds.list({ charge: charge.id, limit: 100 });
  for (const refund of refunds.data) {
    if (refund.status !== "succeeded" && refund.status !== "pending") continue;
    await recordBillingEvent(
      {
        id: refund.id,
        kind: "refund",
        user_id: userId,
        stripe_customer_id: customerId,
        amount_usd: -dollars(refund.amount),
        occurred_at: iso(refund.created),
        details: { charge: charge.id, reason: refund.reason },
      },
      supabase,
    );
  }
}

/** Recorded here; the worker's alert check emails about it, since a dispute has a deadline. */
async function handleDisputeCreated(dispute: Stripe.Dispute, supabase: SupabaseClient): Promise<void> {
  const chargeId = idOf(dispute.charge);
  let customerId: string | null = null;
  if (chargeId) {
    try {
      customerId = idOf((await stripeClient().charges.retrieve(chargeId)).customer);
    } catch (err) {
      console.error("[stripe] Couldn't read the disputed charge", chargeId, err instanceof Error ? err.message : err);
    }
  }
  await recordBillingEvent(
    {
      id: dispute.id,
      kind: "dispute",
      user_id: await userForCustomer(customerId, supabase),
      stripe_customer_id: customerId,
      occurred_at: iso(dispute.created),
      details: {
        amount_usd: dollars(dispute.amount),
        reason: dispute.reason,
        status: dispute.status,
        due_by: dispute.evidence_details?.due_by ? iso(dispute.evidence_details.due_by) : null,
        charge: chargeId,
      },
    },
    supabase,
  );
}

/**
 * Create a Stripe Checkout session for upgrading to a paid plan.
 */
export async function createCheckoutSession(
  userId: string,
  email: string,
  plan: "monthly" | "annual",
  origin: string,
): Promise<string> {
  const stripe = stripeClient();
  const priceId =
    plan === "annual"
      ? process.env.STRIPE_ANNUAL_PRICE_ID!
      : process.env.STRIPE_MONTHLY_PRICE_ID!;

  // Find or create Stripe customer
  const customers = await stripe.customers.list({ email, limit: 1 });
  let customerId: string;
  if (customers.data.length > 0) {
    customerId = customers.data[0].id;
  } else {
    const customer = await stripe.customers.create({
      email,
      metadata: { user_id: userId },
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/settings?checkout=success`,
    cancel_url: `${origin}/pricing`,
    metadata: { user_id: userId },
    subscription_data: {
      // Copied onto every invoice, so a payment can be matched to the reader even if
      // its webhook arrives before checkout's
      metadata: { user_id: userId },
      // Everyone has Companion during the free period, so subscribing early starts
      // billing when it ends. Stripe needs a trial to end at least 48 hours out.
      ...(FREE_PERIOD_ENDS.getTime() - Date.now() > 49 * 60 * 60 * 1000 && {
        trial_end: Math.floor(FREE_PERIOD_ENDS.getTime() / 1000),
      }),
    },
  });

  return session.url!;
}

/**
 * Create a Stripe Customer Portal session for managing an existing subscription.
 */
export async function createPortalSession(
  stripeCustomerId: string,
  origin: string,
): Promise<string> {
  const session = await stripeClient().billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${origin}/settings`,
  });

  return session.url;
}
