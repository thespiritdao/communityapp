-- Create notification_preferences table
-- Date: 2025-01-18
-- Purpose: Store user preferences for notification types, quiet hours, and digest settings

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address TEXT NOT NULL UNIQUE,

  -- Global settings
  enabled BOOLEAN DEFAULT true,
  desktop_enabled BOOLEAN DEFAULT true,
  sound_enabled BOOLEAN DEFAULT true,
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME DEFAULT '22:00:00',
  quiet_hours_end TIME DEFAULT '08:00:00',

  -- Category-level toggles (override individual types)
  category_pod BOOLEAN DEFAULT true,
  category_governance BOOLEAN DEFAULT true,
  category_bounty BOOLEAN DEFAULT true,
  category_chat BOOLEAN DEFAULT true,
  category_forum BOOLEAN DEFAULT true,
  category_event BOOLEAN DEFAULT true,
  category_marketplace BOOLEAN DEFAULT true,

  -- Pod notifications
  pod_membership_application BOOLEAN DEFAULT true,
  pod_application_status BOOLEAN DEFAULT true,
  pod_member_added BOOLEAN DEFAULT true,
  pod_member_removed BOOLEAN DEFAULT true,
  pod_approval_required BOOLEAN DEFAULT true,
  pod_leadership_invitation BOOLEAN DEFAULT true,

  -- Governance notifications
  governance_proposal_created BOOLEAN DEFAULT true,
  governance_proposal_mentioned BOOLEAN DEFAULT true,
  governance_voting_reminder_48h BOOLEAN DEFAULT true,
  governance_voting_reminder_24h BOOLEAN DEFAULT true,
  governance_voting_reminder_6h BOOLEAN DEFAULT true,
  governance_voting_reminder_1h BOOLEAN DEFAULT true,
  governance_proposal_executed BOOLEAN DEFAULT false,

  -- Bounty notifications
  bounty_work_submitted BOOLEAN DEFAULT true,
  bounty_work_reviewed BOOLEAN DEFAULT true,
  bounty_dispute_filed BOOLEAN DEFAULT true,
  bounty_evidence_submitted BOOLEAN DEFAULT true,
  bounty_dispute_resolved BOOLEAN DEFAULT true,
  bounty_cancelled BOOLEAN DEFAULT true,

  -- Chat & Forum notifications
  chat_direct_message BOOLEAN DEFAULT true,
  forum_user_mentioned BOOLEAN DEFAULT true,
  forum_thread_reply BOOLEAN DEFAULT true,
  forum_participating_reply BOOLEAN DEFAULT false,

  -- Event notifications
  event_registration_confirmation BOOLEAN DEFAULT true,
  event_reminder_7d BOOLEAN DEFAULT true,
  event_reminder_day_of BOOLEAN DEFAULT true,
  event_checkin_prompt BOOLEAN DEFAULT true,
  event_updated BOOLEAN DEFAULT true,
  event_cancelled BOOLEAN DEFAULT true,
  event_completion_nft BOOLEAN DEFAULT true,

  -- Marketplace notifications
  marketplace_purchase_fulfillment BOOLEAN DEFAULT true,
  marketplace_order_status BOOLEAN DEFAULT true,
  marketplace_review_mention BOOLEAN DEFAULT true,

  -- Digest settings (future)
  digest_daily_enabled BOOLEAN DEFAULT false,
  digest_weekly_enabled BOOLEAN DEFAULT false,
  digest_daily_time TIME DEFAULT '09:00:00',

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user
  ON notification_preferences(user_address);

-- Enable Row Level Security
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only read/update their own preferences

-- Policy: Users can view their own preferences
CREATE POLICY "Users can view own preferences"
  ON notification_preferences FOR SELECT
  USING (LOWER(user_address) = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- Policy: Users can update their own preferences
CREATE POLICY "Users can update own preferences"
  ON notification_preferences FOR UPDATE
  USING (LOWER(user_address) = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- Policy: Users can insert their own preferences
CREATE POLICY "Users can insert own preferences"
  ON notification_preferences FOR INSERT
  WITH CHECK (LOWER(user_address) = LOWER(current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_notification_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function before updates
CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_updated_at();

-- Add helpful comment
COMMENT ON TABLE notification_preferences IS 'User preferences for notification types, quiet hours, and delivery settings';
