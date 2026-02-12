-- Migration 023: User subscriptions for Stripe monetization
-- Run in Supabase SQL Editor

-- 1. Create user_subscriptions table
CREATE TABLE user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'monthly', 'annual')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  chat_messages_used integer DEFAULT 0,
  chat_messages_period_start timestamptz DEFAULT date_trunc('month', now()),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

-- 2. Enable RLS
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
CREATE POLICY "Users can read own subscription"
  ON user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can INSERT/UPDATE (server-side via webhook/checkout)
-- No user-facing write policies needed

-- 3. Indexes for Stripe ID lookups
CREATE INDEX idx_user_subscriptions_stripe_customer
  ON user_subscriptions(stripe_customer_id);

CREATE INDEX idx_user_subscriptions_stripe_subscription
  ON user_subscriptions(stripe_subscription_id);

-- 4. Auto-update updated_at
CREATE TRIGGER set_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. Auto-create free subscription for new users
CREATE OR REPLACE FUNCTION create_default_subscription()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_default_subscription();

-- 6. Function to reset stale monthly chat counters
CREATE OR REPLACE FUNCTION reset_monthly_chat_counts()
RETURNS void AS $$
  UPDATE user_subscriptions
  SET chat_messages_used = 0,
      chat_messages_period_start = date_trunc('month', now())
  WHERE chat_messages_period_start < date_trunc('month', now());
$$ LANGUAGE sql SECURITY DEFINER;
