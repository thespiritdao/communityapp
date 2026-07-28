-- 007: account_deletion_requests — tracks in-app account deletion requests
-- (Google Play data-deletion requirement). Written only by the service role
-- via /api/account/delete; RLS enabled with no policies so clients cannot
-- read or write it directly.

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  email text,
  status text NOT NULL DEFAULT 'pending', -- pending | completed | cancelled
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  notes text
);

-- One open request per wallet.
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_pending_uniq
  ON account_deletion_requests (wallet_address)
  WHERE status = 'pending';

ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;
