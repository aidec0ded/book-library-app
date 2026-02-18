import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// --- CLI args ---

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email = args.find((a) => !a.startsWith("--"));

if (!email) {
  console.error("Usage: npx tsx scripts/grant-subscription.ts <email> [--revoke]");
  console.error("");
  console.error("  Grant:  npx tsx scripts/grant-subscription.ts user@example.com");
  console.error("  Revoke: npx tsx scripts/grant-subscription.ts user@example.com --revoke");
  process.exit(1);
}

// --- Lookup user by email ---

const { data: users, error: lookupError } = await supabase.auth.admin.listUsers();
if (lookupError) {
  console.error("Failed to list users:", lookupError.message);
  process.exit(1);
}

const user = users.users.find(
  (u) => u.email?.toLowerCase() === email.toLowerCase(),
);

if (!user) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}

console.log(`Found user: ${user.email} (${user.id})`);

// --- Update subscription ---

if (revoke) {
  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      plan: "free",
      status: "active",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      current_period_start: null,
      current_period_end: null,
      cancel_at_period_end: false,
    })
    .eq("user_id", user.id);

  if (error) {
    console.error("Failed to revoke subscription:", error.message);
    process.exit(1);
  }

  console.log(`Revoked paid subscription for ${user.email} — now on free tier.`);
} else {
  const { error } = await supabase
    .from("user_subscriptions")
    .update({
      plan: "annual",
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: "2099-12-31T23:59:59.000Z",
      cancel_at_period_end: false,
      chat_messages_used: 0,
    })
    .eq("user_id", user.id);

  if (error) {
    console.error("Failed to grant subscription:", error.message);
    process.exit(1);
  }

  console.log(`Granted complimentary paid subscription to ${user.email}.`);
}
