import type { SupabaseClient } from "@supabase/supabase-js";
import { FREE_PERIOD_ENDS_ISO } from "../src/lib/plans.js";

/**
 * A paying subscriber. "past_due" counts: when a renewal fails, Stripe retries the card
 * for up to a couple of weeks, and the reader keeps Companion while they fix it. When
 * Stripe gives up, the subscription becomes unpaid or canceled and they drop to free.
 */
export function isPaidAndActive(sub: { plan: string; status: string }): boolean {
  return sub.plan !== "free" && (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due");
}

/**
 * The free launch period: everyone has Companion, with its monthly reply cap, until this
 * moment. Midnight on 1 January 2027 in US Pacific time, so readers across the US keep it
 * through 31 December. FREE_PERIOD_ENDS (an ISO time) overrides it.
 */
export const FREE_PERIOD_ENDS = new Date(process.env.FREE_PERIOD_ENDS ?? FREE_PERIOD_ENDS_ISO);

export function inFreePeriod(now = new Date()): boolean {
  return now < FREE_PERIOD_ENDS;
}

/** Whether a reader gets Companion: a paying subscriber, or anyone during the free period. */
export function hasCompanion(sub: { plan: string; status: string }, now = new Date()): boolean {
  return isPaidAndActive(sub) || inFreePeriod(now);
}

async function readMessagesUsed(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("chat_messages_used")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data.chat_messages_used as number;
}

/** Move the counter only if it still holds the value we read, so simultaneous updates can't overlap. */
async function moveMessagesUsed(
  supabase: SupabaseClient,
  userId: string,
  from: number,
  to: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_subscriptions")
    .update({ chat_messages_used: to })
    .eq("user_id", userId)
    .eq("chat_messages_used", from)
    .select("user_id")
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/**
 * Claim one of a free reader's messages before doing any work, returning false at the limit.
 * Checking first and counting afterward let requests sent together all pass the check.
 */
export async function claimMessage(
  supabase: SupabaseClient,
  userId: string,
  used: number,
  limit: number,
): Promise<boolean> {
  let current = used;
  while (current < limit) {
    if (await moveMessagesUsed(supabase, userId, current, current + 1)) return true;
    current = await readMessagesUsed(supabase, userId);
  }
  return false;
}

/** Give a claimed message back, for a reply that failed. */
export async function releaseMessage(supabase: SupabaseClient, userId: string): Promise<void> {
  let current = await readMessagesUsed(supabase, userId);
  while (current > 0) {
    if (await moveMessagesUsed(supabase, userId, current, current - 1)) return;
    current = await readMessagesUsed(supabase, userId);
  }
}
