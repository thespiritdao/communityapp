-- Migration: Rename legacy Mercury columns to Stripe in pending_donations
-- Run this in your Supabase SQL editor before deploying the updated application.
-- Safe to run multiple times — uses IF EXISTS guards.

-- 1. Rename mercury_payment_id → stripe_payment_id
ALTER TABLE pending_donations
  RENAME COLUMN mercury_payment_id TO stripe_payment_id;

-- 2. Rename mercury_fee → stripe_fee
ALTER TABLE pending_donations
  RENAME COLUMN mercury_fee TO stripe_fee;

-- 3. Rename mercury_confirmed_at → stripe_confirmed_at
ALTER TABLE pending_donations
  RENAME COLUMN mercury_confirmed_at TO stripe_confirmed_at;


-- ─── token_claims table ────────────────────────────────────────────────────────
-- Required for the new burn-for-payout (Claim) feature.

CREATE TABLE IF NOT EXISTS token_claims (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address        TEXT NOT NULL,
  system_tokens_to_burn NUMERIC(20, 8) NOT NULL CHECK (system_tokens_to_burn > 0),
  estimated_payout_usd  NUMERIC(12, 2) NOT NULL,
  payout_email          TEXT NOT NULL,
  payout_note           TEXT,
  status                TEXT NOT NULL DEFAULT 'pending_burn'
                          CHECK (status IN (
                            'pending_burn',
                            'awaiting_executive_approval',
                            'approved',
                            'paid',
                            'rejected'
                          )),
  burn_tx_hash          TEXT,
  burned_at             TIMESTAMPTZ,
  approved_at           TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  approver_wallet       TEXT,
  rejection_reason      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_claims_wallet
  ON token_claims (wallet_address);

CREATE INDEX IF NOT EXISTS idx_token_claims_status
  ON token_claims (status);

-- RLS: service role can do everything; authenticated users can only read their own rows
ALTER TABLE token_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own claims"
  ON token_claims FOR SELECT
  USING (wallet_address = lower(current_setting('request.jwt.claims', true)::json->>'wallet'));

-- Service role bypasses RLS (set in Supabase dashboard — no policy needed)
