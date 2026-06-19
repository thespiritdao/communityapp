-- $SELF Phase 1 — earn-loop ledger (budgets, mint queue, per-member caps).
--
-- The on-chain SelfEpochs/SelfMinter contracts are the truth of BALANCES; this
-- ledger is the truth of ENTITLEMENT — who earned what, against which budget,
-- with caps and diminishing returns. Keeping budgets/caps off-chain lets policy
-- evolve without contract redeploys (see docs/spec-self-soulbound-redesign.md §3).
--
-- 1e18 = 1 verified participation-hour. We store hours as NUMERIC(78,0) (wei-
-- scale integers) so on-chain amounts and ledger amounts are the same unit with
-- no float drift. NUMERIC(78,0) holds any uint256.
--
-- Apply manually via the Supabase SQL editor (project convention).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Per-pod, per-epoch mint budget (capacity, NOT a token balance).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pod_self_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  epoch INTEGER NOT NULL,                       -- global quarter counter (matches SelfEpochs.currentEpoch)
  allocated_hours NUMERIC(78,0) NOT NULL DEFAULT 0, -- minting capacity for this pod/epoch (wei, 1e18=1h)
  minted_hours NUMERIC(78,0) NOT NULL DEFAULT 0,    -- hours already minted against it
  source TEXT NOT NULL DEFAULT 'algorithmic'
    CHECK (source IN ('algorithmic', 'exec_petition', 'multiplier')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pod_id, epoch)
);

CREATE INDEX IF NOT EXISTS idx_pod_self_budgets_pod_epoch
  ON pod_self_budgets (pod_id, epoch);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Mint queue — one row per pending/processed earning event.
--    The attestation pipeline writes 'pending' rows; review/batch moves them to
--    'minted' (or 'exec_review'/'rejected'). The on-chain mint references the
--    row id as its sourceRef for the audit trail.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS self_mint_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet TEXT NOT NULL,                          -- recipient (lowercased)
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  community_id BIGINT NOT NULL,                  -- on-chain communityId for this pod (uint224 fits in numeric; bigint ok for our id space)
  epoch INTEGER NOT NULL,                        -- epoch the earning belongs to
  hours NUMERIC(78,0) NOT NULL,                  -- credited hours AFTER caps (wei, 1e18=1h)
  raw_hours NUMERIC(78,0) NOT NULL,              -- pre-cap hours (for audit/anomaly math)
  source_type TEXT NOT NULL
    CHECK (source_type IN ('event_attendance', 'bounty_completion', 'governance_vote', 'verification', 'role_service')),
  source_ref TEXT NOT NULL,                      -- attestation id (event_registration id, bounty id, vote id, ...)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'exec_review', 'rejected', 'minted', 'clawed_back')),
  anomaly_flags JSONB NOT NULL DEFAULT '[]',     -- e.g. ["high_value","ratio_out_of_band"]
  batch_id TEXT,                                 -- on-chain batchId once minted
  tx_hash TEXT,                                  -- mint tx
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  minted_at TIMESTAMPTZ,
  -- Idempotency: a given attested action mints at most once per source.
  UNIQUE (source_type, source_ref, wallet)
);

CREATE INDEX IF NOT EXISTS idx_self_mint_queue_status ON self_mint_queue (status);
CREATE INDEX IF NOT EXISTS idx_self_mint_queue_pod_epoch ON self_mint_queue (pod_id, epoch);
CREATE INDEX IF NOT EXISTS idx_self_mint_queue_wallet ON self_mint_queue (wallet);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Per-member per-epoch running total — drives diminishing-returns caps.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS self_member_epoch_earned (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet TEXT NOT NULL,                          -- lowercased
  pod_id UUID NOT NULL REFERENCES pods(id) ON DELETE CASCADE,
  epoch INTEGER NOT NULL,
  hours NUMERIC(78,0) NOT NULL DEFAULT 0,        -- cumulative credited hours this member/pod/epoch
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wallet, pod_id, epoch)
);

CREATE INDEX IF NOT EXISTS idx_self_member_epoch_earned_lookup
  ON self_member_epoch_earned (wallet, pod_id, epoch);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS. Earning data is governance-transparency data (like the Pulse feed) — any
-- authenticated user may READ. WRITES happen ONLY via the server (service-role
-- key), which bypasses RLS — so we add NO insert/update policy (default-deny for
-- the anon/authenticated roles; service-role is unaffected).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE pod_self_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_mint_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_member_epoch_earned ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pod_self_budgets_select ON pod_self_budgets;
CREATE POLICY pod_self_budgets_select ON pod_self_budgets
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS self_mint_queue_select ON self_mint_queue;
CREATE POLICY self_mint_queue_select ON self_mint_queue
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS self_member_epoch_earned_select ON self_member_epoch_earned;
CREATE POLICY self_member_epoch_earned_select ON self_member_epoch_earned
  FOR SELECT TO authenticated USING (true);

-- No INSERT/UPDATE/DELETE policies: only the service-role server writes these.
