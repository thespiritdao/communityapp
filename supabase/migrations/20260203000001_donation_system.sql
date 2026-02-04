-- =====================================================
-- SpiritDAO Donation & Burn System
-- Mercury Integration for Fiat <-> $SYSTEM Token Flow
-- Created: 2026-02-03
-- =====================================================

-- =====================================================
-- 1. PENDING DONATIONS TABLE
-- Tracks fiat donations awaiting settlement & minting
-- =====================================================
CREATE TABLE IF NOT EXISTS pending_donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Mercury payment tracking
  mercury_payment_id TEXT UNIQUE NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('ach', 'card')),

  -- User & amounts
  user_wallet TEXT NOT NULL,
  donor_email TEXT,
  fiat_amount DECIMAL(10,2) NOT NULL CHECK (fiat_amount >= 10.00),
  system_tokens_to_mint DECIMAL(18,8) NOT NULL,
  org_fee DECIMAL(10,2) NOT NULL,
  mercury_fee DECIMAL(10,2) NOT NULL,

  -- Settlement tracking
  settlement_days INTEGER NOT NULL DEFAULT 5,
  settlement_date TIMESTAMPTZ,
  is_reversible BOOLEAN DEFAULT FALSE,

  -- Status flow: payment_pending -> awaiting_settlement -> awaiting_executive_approval -> minted -> failed/disputed
  status TEXT NOT NULL DEFAULT 'payment_pending' CHECK (
    status IN (
      'payment_pending',
      'awaiting_settlement',
      'awaiting_executive_approval',
      'minted',
      'failed',
      'disputed'
    )
  ),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  mercury_confirmed_at TIMESTAMPTZ,
  minted_at TIMESTAMPTZ,
  disputed_at TIMESTAMPTZ,

  -- Metadata
  failure_reason TEXT,
  dispute_reason TEXT,
  mint_transaction_hash TEXT
);

-- Indexes for performance
CREATE INDEX idx_pending_donations_status ON pending_donations(status);
CREATE INDEX idx_pending_donations_user_wallet ON pending_donations(user_wallet);
CREATE INDEX idx_pending_donations_settlement_date ON pending_donations(settlement_date);
CREATE INDEX idx_pending_donations_created_at ON pending_donations(created_at DESC);

-- =====================================================
-- 2. DONATION APPROVALS TABLE
-- Multi-sig approval by Executive Pod (2-of-3)
-- =====================================================
CREATE TABLE IF NOT EXISTS donation_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_id UUID REFERENCES pending_donations(id) ON DELETE CASCADE,
  approver_wallet TEXT NOT NULL,
  approver_hat_id TEXT NOT NULL, -- Executive Pod Leader hat
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  approval_signature TEXT, -- Optional: SIWE signature proof

  -- Prevent duplicate approvals
  UNIQUE(donation_id, approver_wallet)
);

CREATE INDEX idx_donation_approvals_donation_id ON donation_approvals(donation_id);

-- =====================================================
-- 3. BURN REQUESTS TABLE
-- Users requesting to burn $SYSTEM for USD payout
-- =====================================================
CREATE TABLE IF NOT EXISTS burn_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User & amounts
  user_wallet TEXT NOT NULL,
  system_amount DECIMAL(18,8) NOT NULL CHECK (system_amount >= 50.00), -- Minimum $50 burn
  fiat_amount DECIMAL(10,2) NOT NULL,

  -- Payout details (encrypted)
  recipient_bank_account_encrypted TEXT, -- Store encrypted bank details
  recipient_bank_routing_encrypted TEXT,
  recipient_name TEXT NOT NULL,

  -- Status flow: pending_approval -> approved -> burning -> burned -> pending_payment -> completed -> rejected
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (
    status IN (
      'pending_approval',
      'approved',
      'burning',
      'burned',
      'pending_payment',
      'completed',
      'rejected'
    )
  ),

  -- Blockchain tracking
  burn_tx_hash TEXT,
  burn_confirmed_at TIMESTAMPTZ,

  -- Mercury payout tracking
  mercury_transaction_id TEXT,
  mercury_payout_confirmed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,

  -- Metadata
  rejection_reason TEXT,
  notes TEXT
);

CREATE INDEX idx_burn_requests_status ON burn_requests(status);
CREATE INDEX idx_burn_requests_user_wallet ON burn_requests(user_wallet);
CREATE INDEX idx_burn_requests_created_at ON burn_requests(created_at DESC);

-- =====================================================
-- 4. BURN APPROVALS TABLE
-- Multi-sig approval by Executive Pod (2-of-3)
-- =====================================================
CREATE TABLE IF NOT EXISTS burn_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  burn_request_id UUID REFERENCES burn_requests(id) ON DELETE CASCADE,
  approver_wallet TEXT NOT NULL,
  approver_hat_id TEXT NOT NULL,
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  approval_signature TEXT,

  UNIQUE(burn_request_id, approver_wallet)
);

CREATE INDEX idx_burn_approvals_burn_request_id ON burn_approvals(burn_request_id);

-- =====================================================
-- 5. TREASURY SNAPSHOTS TABLE
-- Daily sync of Mercury balance vs on-chain $SYSTEM supply
-- =====================================================
CREATE TABLE IF NOT EXISTS treasury_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Balances
  mercury_balance DECIMAL(10,2) NOT NULL,
  system_total_supply DECIMAL(18,8) NOT NULL,
  system_circulating_supply DECIMAL(18,8) NOT NULL,

  -- Calculations
  discrepancy DECIMAL(10,2) NOT NULL, -- mercury_balance - system_circulating_supply
  discrepancy_percentage DECIMAL(5,2),

  -- Metadata
  snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  is_anomaly BOOLEAN DEFAULT FALSE, -- True if discrepancy > $100
  notes TEXT
);

CREATE INDEX idx_treasury_snapshots_snapshot_at ON treasury_snapshots(snapshot_at DESC);
CREATE INDEX idx_treasury_snapshots_is_anomaly ON treasury_snapshots(is_anomaly);

-- =====================================================
-- 6. SYSTEM SUPPLY METADATA (Singleton)
-- Tracks total $SYSTEM minted/burned for quick reference
-- =====================================================
CREATE TABLE IF NOT EXISTS system_supply_metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Singleton pattern

  total_supply DECIMAL(18,8) NOT NULL DEFAULT 0,
  total_minted DECIMAL(18,8) NOT NULL DEFAULT 0,
  total_burned DECIMAL(18,8) NOT NULL DEFAULT 0,
  total_donations_count INTEGER NOT NULL DEFAULT 0,
  total_burns_count INTEGER NOT NULL DEFAULT 0,

  last_mint_at TIMESTAMPTZ,
  last_burn_at TIMESTAMPTZ,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize singleton row
INSERT INTO system_supply_metadata (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE pending_donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE donation_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE burn_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE burn_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_supply_metadata ENABLE ROW LEVEL SECURITY;

-- Pending Donations: Users can view their own, executives can view all
CREATE POLICY "Users can view own donations"
  ON pending_donations FOR SELECT
  USING (user_wallet = auth.jwt() ->> 'wallet_address' OR auth.role() = 'service_role');

CREATE POLICY "Service role can insert donations"
  ON pending_donations FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update donations"
  ON pending_donations FOR UPDATE
  USING (auth.role() = 'service_role');

-- Donation Approvals: Only service role (backend API)
CREATE POLICY "Service role manages donation approvals"
  ON donation_approvals FOR ALL
  USING (auth.role() = 'service_role');

-- Burn Requests: Users can view their own, executives can view all
CREATE POLICY "Users can view own burn requests"
  ON burn_requests FOR SELECT
  USING (user_wallet = auth.jwt() ->> 'wallet_address' OR auth.role() = 'service_role');

CREATE POLICY "Users can create burn requests"
  ON burn_requests FOR INSERT
  WITH CHECK (user_wallet = auth.jwt() ->> 'wallet_address');

CREATE POLICY "Service role can update burn requests"
  ON burn_requests FOR UPDATE
  USING (auth.role() = 'service_role');

-- Burn Approvals: Only service role
CREATE POLICY "Service role manages burn approvals"
  ON burn_approvals FOR ALL
  USING (auth.role() = 'service_role');

-- Treasury Snapshots: Public read, service role write
CREATE POLICY "Public can view treasury snapshots"
  ON treasury_snapshots FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage treasury snapshots"
  ON treasury_snapshots FOR ALL
  USING (auth.role() = 'service_role');

-- System Supply Metadata: Public read, service role write
CREATE POLICY "Public can view system supply"
  ON system_supply_metadata FOR SELECT
  USING (true);

CREATE POLICY "Service role can update system supply"
  ON system_supply_metadata FOR UPDATE
  USING (auth.role() = 'service_role');

-- =====================================================
-- 8. HELPER FUNCTIONS
-- =====================================================

-- Function to check if donation has 2-of-3 approvals
CREATE OR REPLACE FUNCTION check_donation_approval_threshold(donation_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  approval_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO approval_count
  FROM donation_approvals
  WHERE donation_id = donation_uuid;

  RETURN approval_count >= 2;
END;
$$ LANGUAGE plpgsql;

-- Function to check if burn request has 2-of-3 approvals
CREATE OR REPLACE FUNCTION check_burn_approval_threshold(burn_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  approval_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO approval_count
  FROM burn_approvals
  WHERE burn_request_id = burn_uuid;

  RETURN approval_count >= 2;
END;
$$ LANGUAGE plpgsql;

-- Function to update system supply metadata
CREATE OR REPLACE FUNCTION update_system_supply(
  amount DECIMAL(18,8),
  operation TEXT -- 'mint' or 'burn'
)
RETURNS VOID AS $$
BEGIN
  IF operation = 'mint' THEN
    UPDATE system_supply_metadata
    SET
      total_supply = total_supply + amount,
      total_minted = total_minted + amount,
      total_donations_count = total_donations_count + 1,
      last_mint_at = NOW(),
      last_updated = NOW()
    WHERE id = 1;
  ELSIF operation = 'burn' THEN
    UPDATE system_supply_metadata
    SET
      total_supply = total_supply - amount,
      total_burned = total_burned + amount,
      total_burns_count = total_burns_count + 1,
      last_burn_at = NOW(),
      last_updated = NOW()
    WHERE id = 1;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 9. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE pending_donations IS 'Tracks fiat donations from Mercury awaiting $SYSTEM token minting';
COMMENT ON TABLE donation_approvals IS 'Multi-sig approvals by Executive Pod for minting $SYSTEM';
COMMENT ON TABLE burn_requests IS 'User requests to burn $SYSTEM tokens for USD payouts';
COMMENT ON TABLE burn_approvals IS 'Multi-sig approvals by Executive Pod for processing burns';
COMMENT ON TABLE treasury_snapshots IS 'Daily snapshots of Mercury balance vs on-chain $SYSTEM supply';
COMMENT ON TABLE system_supply_metadata IS 'Singleton table tracking total $SYSTEM minted/burned';

COMMENT ON COLUMN pending_donations.settlement_days IS '5 days for credit cards, 0 for ACH';
COMMENT ON COLUMN pending_donations.is_reversible IS 'True if credit card payment (chargeback risk)';
COMMENT ON COLUMN burn_requests.system_amount IS 'Minimum $50 to avoid micro-burn spam';
