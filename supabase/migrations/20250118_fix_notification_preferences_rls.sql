-- Fix notification_preferences RLS policies
-- Date: 2025-01-18
-- Issue: Policies were using 'sub' instead of 'wallet_address' in JWT claims

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON notification_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON notification_preferences;

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

-- Add helpful comment
COMMENT ON TABLE notification_preferences IS 'User preferences for notification types, quiet hours, and delivery settings. RLS policies ensure users can only access their own preferences.';
