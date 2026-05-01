-- 011_agent_subscription_pause.sql
-- Add columns to support pausing/resuming community agent subscriptions.
-- When a pod leader disables the agent, remaining_days is snapshot and
-- the subscription moves to 'paused'. On re-enable, expires_at is
-- recalculated from remaining_days.

ALTER TABLE community_agent_subscriptions
  ADD COLUMN IF NOT EXISTS remaining_days double precision,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

-- Allow 'paused' as a valid status value
-- (existing values: 'active', 'expired')
COMMENT ON COLUMN community_agent_subscriptions.remaining_days IS 'Days remaining when subscription was paused. Null when active.';
COMMENT ON COLUMN community_agent_subscriptions.paused_at IS 'When the subscription was paused. Null when active.';
