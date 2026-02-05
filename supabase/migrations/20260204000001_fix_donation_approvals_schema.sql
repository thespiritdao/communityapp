-- Fix donation_approvals table schema to match API code
-- The API uses 'executive_wallet' but table has 'approver_wallet'
-- The API doesn't provide 'approver_hat_id' which is NOT NULL

-- 1. Make approver_hat_id optional (can be null)
ALTER TABLE donation_approvals
ALTER COLUMN approver_hat_id DROP NOT NULL;

-- 2. Rename approver_wallet to executive_wallet
ALTER TABLE donation_approvals
RENAME COLUMN approver_wallet TO executive_wallet;

-- 3. Update the unique constraint to use new column name
ALTER TABLE donation_approvals
DROP CONSTRAINT IF EXISTS donation_approvals_donation_id_approver_wallet_key;

ALTER TABLE donation_approvals
ADD CONSTRAINT donation_approvals_donation_id_executive_wallet_key
UNIQUE(donation_id, executive_wallet);

COMMENT ON COLUMN donation_approvals.executive_wallet IS 'Wallet address of Executive Pod member approving the donation';
COMMENT ON COLUMN donation_approvals.approver_hat_id IS 'Optional: Executive Pod Leader HAT ID for verification';
