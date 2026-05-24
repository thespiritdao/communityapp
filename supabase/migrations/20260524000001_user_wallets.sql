-- Platform Identity: Multi-Wallet (Phase 1)
--
-- One user can hold multiple EVM addresses (one per device, by CDP
-- embedded wallet design). This migration introduces the user_wallets
-- table that links any number of EVM addresses to one user_id, plus
-- user_wallet_link_codes for the one-time-code linking flow.
--
-- Backfill: every existing user_profiles.wallet_address becomes that
-- user's canonical user_wallets row. Backwards compatibility is
-- preserved during the phased rollout; user_profiles.wallet_address is
-- not dropped here.
--
-- See docs/spec-platform-identity-multi-wallet.md.

-- ── user_wallets ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_wallets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address      TEXT NOT NULL UNIQUE, -- always lowercase
  is_canonical        BOOLEAN NOT NULL DEFAULT false,
  nickname            TEXT,
  linked_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  linked_via_wallet   TEXT,         -- the already-linked wallet that authorized this link; null for canonical
  last_seen_at        TIMESTAMPTZ
);

-- Exactly one canonical wallet per user
CREATE UNIQUE INDEX IF NOT EXISTS user_wallets_one_canonical_per_user
  ON user_wallets(user_id) WHERE is_canonical = true;

CREATE INDEX IF NOT EXISTS user_wallets_user_id_idx
  ON user_wallets(user_id);

CREATE INDEX IF NOT EXISTS user_wallets_wallet_address_idx
  ON user_wallets(wallet_address);

COMMENT ON TABLE user_wallets IS
  'All EVM addresses linked to a user. Exactly one row per user has is_canonical=true; the rest are additional devices linked via the one-time-code linking flow. Any address in this table can authorize actions on behalf of the user_id. See docs/spec-platform-identity-multi-wallet.md.';

COMMENT ON COLUMN user_wallets.linked_via_wallet IS
  'Which already-linked wallet issued the one-time code that authorized this link. NULL for the canonical (first) wallet, which is established at signup.';

-- ── user_wallet_link_codes ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_wallet_link_codes (
  code                TEXT PRIMARY KEY, -- 6-char alphanumeric, uppercase
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  issued_by_wallet    TEXT NOT NULL,    -- the already-linked wallet that requested the code
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at         TIMESTAMPTZ,
  consumed_by_wallet  TEXT
);

CREATE INDEX IF NOT EXISTS user_wallet_link_codes_user_id_idx
  ON user_wallet_link_codes(user_id) WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS user_wallet_link_codes_expires_at_idx
  ON user_wallet_link_codes(expires_at) WHERE consumed_at IS NULL;

COMMENT ON TABLE user_wallet_link_codes IS
  'Short-lived one-time codes used to link a new device''s CDP wallet to an existing user account. Issued from an already-authenticated device; consumed on the new device. 10-minute expiry. Single-use.';

-- ── RLS: lock everything down by default ───────────────────────────
-- All access goes through the service-role admin client (auth routes).
-- Authenticated clients can read their own user_wallets list via the
-- linked-wallets API route, not directly via Supabase client.
ALTER TABLE user_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_wallet_link_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own wallets"
  ON user_wallets FOR SELECT
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub')::uuid);

-- Inserts, updates, deletes go through service role only (admin client).
-- No client-side write policies.

-- ── Backfill: existing user_profiles.wallet_address → canonical row ─
INSERT INTO user_wallets (user_id, wallet_address, is_canonical, linked_at, last_seen_at)
SELECT
  user_id,
  LOWER(wallet_address) AS wallet_address,
  true                  AS is_canonical,
  COALESCE(onboarded_at, NOW()) AS linked_at,
  NOW()                 AS last_seen_at
FROM user_profiles
WHERE wallet_address IS NOT NULL
  AND wallet_address ~* '^0x[a-f0-9]{40}$'
ON CONFLICT (wallet_address) DO NOTHING;
