-- External wallet linking (verified by signature).
--
-- Lets a member link an external wallet (e.g. MetaMask) by signing a
-- proof-of-ownership nonce, so token balances ($TGN) can be read across their
-- SpiritDAO embedded wallet + verified external wallets. Governance-only.
-- See docs/spec-external-wallet-linking.md.
--
-- Apply manually via the Supabase SQL editor (project convention).

-- 1. Tag wallet rows by how they were linked. Existing rows are CDP device
--    wallets; external verified wallets are 'external'.
ALTER TABLE user_wallets
  ADD COLUMN IF NOT EXISTS wallet_type TEXT NOT NULL DEFAULT 'device'
  CHECK (wallet_type IN ('device', 'external'));

-- 2. Per-pod flag: whether this pod COUNTS a member's linked-wallet balances
--    (eligibility + voting). Off by default; enabled by the Executive Pod only.
ALTER TABLE pod_modules
  ADD COLUMN IF NOT EXISTS external_wallet_linking_enabled BOOLEAN DEFAULT FALSE;

-- 3. One-time nonces for external-wallet proof-of-ownership (replay protection).
--    Mirrors user_wallet_link_codes.
CREATE TABLE IF NOT EXISTS wallet_link_nonces (
  nonce         TEXT PRIMARY KEY,          -- random, single-use
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address       TEXT NOT NULL,             -- the external address to be linked (lowercase)
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS wallet_link_nonces_user_id_idx
  ON wallet_link_nonces(user_id) WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS wallet_link_nonces_expires_at_idx
  ON wallet_link_nonces(expires_at) WHERE consumed_at IS NULL;

COMMENT ON COLUMN user_wallets.wallet_type IS
  '''device'' = CDP embedded device wallet; ''external'' = verified external wallet (MetaMask etc.)';
COMMENT ON COLUMN pod_modules.external_wallet_linking_enabled IS
  'When true, this pod counts a member''s verified linked-wallet balances for eligibility + voting. Executive-Pod-toggled only.';
