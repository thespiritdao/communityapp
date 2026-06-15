-- Allow 'refund_pending' on event_registrations.payment_status.
--
-- Context: cancelEvent() previously marked paid registrations 'refunded' even
-- when NO on-chain refund ran (legacy/desynced events with no
-- blockchain_event_id), falsely telling attendees they were refunded while
-- escrowed tokens stayed locked. The app now marks such registrations
-- 'refund_pending' (truthful) and only 'refunded' when the on-chain
-- EventManager.cancelEvent() actually executed. The existing CHECK constraint
-- only permits ('pending','completed','refunded'), so 'refund_pending' must be
-- added or the truthful write throws.
--
-- Apply manually via the Supabase SQL editor (project convention).

ALTER TABLE event_registrations
  DROP CONSTRAINT IF EXISTS event_registrations_payment_status_check;

ALTER TABLE event_registrations
  ADD CONSTRAINT event_registrations_payment_status_check
  CHECK (payment_status IN ('pending', 'completed', 'refunded', 'refund_pending'));
