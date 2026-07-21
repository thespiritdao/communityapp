-- Fix: direct donations always 500'd — pending_donations constraints were
-- written for the $SYSTEM flow only and reject every direct-donation insert:
--   1. payment_method CHECK allowed only ('ach','card'); direct flow inserts 'direct'
--   2. fiat_amount CHECK required >= $10; direct donations advertise a $1 minimum
--   3. status CHECK lacked 'direct_donation_pending' / 'direct_donation_completed'
-- Run manually in the Supabase SQL editor per project convention.

ALTER TABLE pending_donations
DROP CONSTRAINT IF EXISTS pending_donations_payment_method_check;

ALTER TABLE pending_donations
ADD CONSTRAINT pending_donations_payment_method_check
  CHECK (payment_method IN ('ach', 'card', 'direct'));

-- Keep the $10 floor for the token-minting flow; direct gifts allow $1.
ALTER TABLE pending_donations
DROP CONSTRAINT IF EXISTS pending_donations_fiat_amount_check;

ALTER TABLE pending_donations
ADD CONSTRAINT pending_donations_fiat_amount_check
  CHECK (
    fiat_amount >= CASE WHEN payment_method = 'direct' THEN 1.00 ELSE 10.00 END
  );

ALTER TABLE pending_donations
DROP CONSTRAINT IF EXISTS pending_donations_status_check;

ALTER TABLE pending_donations
ADD CONSTRAINT pending_donations_status_check CHECK (
  status IN (
    'payment_pending',
    'awaiting_settlement',
    'awaiting_executive_approval',
    'pending_mint',
    'minting',
    'minted',
    'failed',
    'disputed',
    'direct_donation_pending',
    'direct_donation_completed'
  )
);

COMMENT ON COLUMN pending_donations.status IS
  'Token flow: payment_pending → awaiting_settlement → awaiting_executive_approval → pending_mint → minting → minted (or failed/disputed). Direct flow: direct_donation_pending → direct_donation_completed.';
