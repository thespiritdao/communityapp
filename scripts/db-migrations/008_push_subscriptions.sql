-- Migration 008: Push subscription storage for Web Push notifications
-- Stores browser PushSubscription objects per user/device
-- Multiple rows per user (one per browser/device)

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_address);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- System (admin client) can insert and delete — users cannot directly touch this table
CREATE POLICY "Service role can manage push subscriptions"
  ON push_subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);
