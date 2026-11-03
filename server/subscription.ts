import type { SupabaseClient } from "@supabase/supabase-js";

export function isPaidAndActive(sub: { plan: string; status: string }): boolean {
  return sub.plan !== "free" && (sub.status === "active" || sub.status === "trialing");
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
