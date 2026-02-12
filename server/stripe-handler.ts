import Stripe from "stripe";
import { type SupabaseClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30.basil",
});

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
function mapPlan(priceId: string): "monthly" | "annual" {
  if (priceId === process.env.STRIPE_ANNUAL_PRICE_ID) return "annual";
  return "monthly";
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
    event = stripe.webhooks.constructEvent(
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
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, supabase);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, supabase);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, supabase);
        break;
      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice, supabase);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice, supabase);
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
  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string,
  );

  const priceId = subscription.items.data[0]?.price.id;
  const plan = mapPlan(priceId);

  await supabase.from("user_subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: session.customer as string,
      stripe_subscription_id: subscription.id,
      plan,
      status: mapStatus(subscription.status),
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      chat_messages_used: 0,
      chat_messages_period_start: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  console.log(`[stripe] Checkout completed for user ${userId}, plan: ${plan}`);
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
  supabase: SupabaseClient,
): Promise<void> {
  const priceId = subscription.items.data[0]?.price.id;
  const plan = mapPlan(priceId);

  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      plan,
      status: mapStatus(subscription.status),
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
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
}

async function handlePaymentSucceeded(
  invoice: Stripe.Invoice,
  supabase: SupabaseClient,
): Promise<void> {
  // Reset monthly message counter on successful renewal
  if (!invoice.subscription) return;

  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      chat_messages_used: 0,
      chat_messages_period_start: new Date().toISOString(),
      status: "active",
    })
    .eq("stripe_subscription_id", invoice.subscription as string);

  if (error) {
    console.error("[stripe] payment_succeeded DB error:", error);
  }
}

async function handlePaymentFailed(
  invoice: Stripe.Invoice,
  supabase: SupabaseClient,
): Promise<void> {
  if (!invoice.subscription) return;

  const { error } = await supabase
    .from("user_subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", invoice.subscription as string);

  if (error) {
    console.error("[stripe] payment_failed DB error:", error);
  }
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
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${origin}/settings`,
  });

  return session.url;
}
