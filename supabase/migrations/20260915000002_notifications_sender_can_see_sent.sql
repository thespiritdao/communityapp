-- Follow-up to 20260915000001 (Phase 0, F3).
--
-- The recipient-only SELECT policy broke a legitimate browser flow: when the
-- app inserts a notification and asks for the row back (INSERT ... RETURNING),
-- Postgres applies the SELECT policies to the returned row. The sender is not
-- the recipient, so the row is invisible to them and the insert fails with
-- "new row violates row-level security policy" even though WITH CHECK passed.
--
-- Letting a sender see the notifications they themselves sent is not a
-- privacy leak — they authored them — and it makes RETURNING work. Other
-- members' inboxes stay closed.

CREATE POLICY "notifications: sender reads own sent"
  ON public.general_notifications FOR SELECT
  TO authenticated
  USING (lower(sender_address) = public.session_wallet());
