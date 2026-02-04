-- Add missing 'pending_mint' and 'minting' statuses to pending_donations
-- These are needed for the approval → minting workflow

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
    'disputed'
  )
);

COMMENT ON COLUMN pending_donations.status IS 'Status flow: payment_pending → awaiting_settlement → awaiting_executive_approval → pending_mint → minting → minted (or failed/disputed)';
