-- Migration 025: Onboarding tracking
-- Run in Supabase SQL Editor

-- Track onboarding completion (NULL = not completed)
ALTER TABLE user_subscriptions
  ADD COLUMN onboarding_completed_at timestamptz;

-- Flag onboarding conversations (exempt from message counting)
ALTER TABLE conversations
  ADD COLUMN is_onboarding boolean NOT NULL DEFAULT false;

-- Backfill existing users so they skip onboarding
UPDATE user_subscriptions SET onboarding_completed_at = now();
