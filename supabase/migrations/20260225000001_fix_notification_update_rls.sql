-- Fix RLS UPDATE policies for notification tables
-- Users must be able to mark their own notifications as read via the client.
-- The wallet_address is stored in JWT under 'wallet_address' claim.

-- ============================================================================
-- general_notifications
-- ============================================================================

-- Drop existing UPDATE policy if any (idempotent)
DROP POLICY IF EXISTS "Users can update their own general notifications" ON general_notifications;

CREATE POLICY "Users can update their own general notifications"
ON general_notifications
FOR UPDATE
USING (
  recipient_address = LOWER(auth.jwt() ->> 'wallet_address')
)
WITH CHECK (
  recipient_address = LOWER(auth.jwt() ->> 'wallet_address')
);

-- ============================================================================
-- governance_notifications
-- ============================================================================

DROP POLICY IF EXISTS "Users can update their own governance notifications" ON governance_notifications;

CREATE POLICY "Users can update their own governance notifications"
ON governance_notifications
FOR UPDATE
USING (
  recipient_address = LOWER(auth.jwt() ->> 'wallet_address')
)
WITH CHECK (
  recipient_address = LOWER(auth.jwt() ->> 'wallet_address')
);

-- ============================================================================
-- event_notifications
-- ============================================================================

DROP POLICY IF EXISTS "Users can update their own event notifications" ON event_notifications;

CREATE POLICY "Users can update their own event notifications"
ON event_notifications
FOR UPDATE
USING (
  recipient_address = LOWER(auth.jwt() ->> 'wallet_address')
)
WITH CHECK (
  recipient_address = LOWER(auth.jwt() ->> 'wallet_address')
);
