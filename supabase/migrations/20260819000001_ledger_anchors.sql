-- 20260819000001_ledger_anchors.sql
--
-- Congregant Phase 6: Merkle anchoring of the activity ledger.
-- Each row records a period's Merkle root over explorer_events, mirrored
-- onchain via the LedgerAnchor contract. The DB row is the convenient copy;
-- the onchain event is the tamper-evident one.

CREATE TABLE IF NOT EXISTS ledger_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  event_count INTEGER NOT NULL,
  merkle_root TEXT NOT NULL,          -- 0x-prefixed keccak256 root
  leaf_formula TEXT NOT NULL,         -- documented so researchers can recompute
  onchain_index INTEGER,              -- index in LedgerAnchor.anchors
  tx_hash TEXT,                       -- anchoring transaction
  anchored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_ledger_anchors_period ON ledger_anchors (period_end DESC);

ALTER TABLE ledger_anchors ENABLE ROW LEVEL SECURITY;

-- Public read (transparency is the point); writes via service role only
DROP POLICY IF EXISTS "Anyone can read ledger anchors" ON ledger_anchors;
CREATE POLICY "Anyone can read ledger anchors" ON ledger_anchors
  FOR SELECT TO authenticated, anon USING (true);
