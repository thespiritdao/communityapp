-- Migration 005: Create token_claims table
-- Tracks $SYSTEM burn-for-payout requests from members to the Executive Pod.

CREATE TABLE IF NOT EXISTS token_claims (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address          TEXT NOT NULL,
  system_tokens_to_burn   NUMERIC NOT NULL,
  estimated_payout_usd    NUMERIC NOT NULL,
  payout_email            TEXT NOT NULL,
  payout_note             TEXT,

  -- Lifecycle
  status                  TEXT NOT NULL DEFAULT 'pending_burn',
  -- Values: pending_burn | awaiting_executive_approval | approved | rejected

  -- Set by /api/claims/confirm after on-chain burn
  burn_tx_hash            TEXT,
  burned_at               TIMESTAMPTZ,

  -- Set by /api/claims/action when EP approves or rejects
  reviewed_by             TEXT,
  reviewed_at             TIMESTAMPTZ,
  reviewer_note           TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for wallet lookups
CREATE INDEX IF NOT EXISTS idx_token_claims_wallet ON token_claims (wallet_address);

-- Index for EP management queue
CREATE INDEX IF NOT EXISTS idx_token_claims_status ON token_claims (status);

-- RLS: service role has full access; anon has no access
ALTER TABLE token_claims ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically — no policy needed for server routes.
-- No public read/write: all access goes through API routes using the service role key.
