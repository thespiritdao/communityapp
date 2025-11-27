-- Create treasury_transactions table for unlimited transaction history
-- Generated: 2025-11-25
-- Issue: #10 - Event Indexing Block Range Limits
-- Fix: Deploy missing database table for transaction metadata storage

-- =====================================================
-- 1. CREATE MAIN TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS treasury_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Transaction identification
    tx_hash TEXT UNIQUE,
    pod_id UUID NOT NULL,
    treasury_address TEXT NOT NULL,

    -- Transaction details
    type TEXT NOT NULL CHECK (type IN ('deposit', 'distribution', 'withdrawal')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),

    -- Token information (stored for rich display)
    token_address TEXT NOT NULL,
    token_symbol TEXT NOT NULL,
    token_decimals INTEGER NOT NULL DEFAULT 18,
    amount_raw TEXT NOT NULL,
    amount_formatted TEXT NOT NULL,

    -- User information
    sender_address TEXT,
    recipient_address TEXT,
    sender_name TEXT,
    recipient_name TEXT,

    -- Additional metadata
    reason TEXT,
    transaction_data JSONB,

    -- Blockchain confirmation
    block_number BIGINT,
    block_timestamp TIMESTAMP WITH TIME ZONE,
    gas_used BIGINT,

    -- Foreign key constraint (if pods table exists)
    CONSTRAINT treasury_transactions_pod_fk
      FOREIGN KEY (pod_id)
      REFERENCES pods(id)
      ON DELETE CASCADE
);

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Most common query: Get transactions by pod_id, sorted by date
CREATE INDEX IF NOT EXISTS treasury_transactions_pod_id_idx
  ON treasury_transactions(pod_id, created_at DESC);

-- Query by treasury address
CREATE INDEX IF NOT EXISTS treasury_transactions_treasury_address_idx
  ON treasury_transactions(treasury_address);

-- Query by transaction hash (for lookups)
CREATE INDEX IF NOT EXISTS treasury_transactions_tx_hash_idx
  ON treasury_transactions(tx_hash);

-- Query by status (for pending transactions)
CREATE INDEX IF NOT EXISTS treasury_transactions_status_idx
  ON treasury_transactions(status)
  WHERE status = 'pending';

-- =====================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE treasury_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view transactions (public transparency)
DROP POLICY IF EXISTS "Treasury transactions are viewable by everyone" ON treasury_transactions;
CREATE POLICY "Treasury transactions are viewable by everyone"
  ON treasury_transactions
  FOR SELECT
  USING (true);

-- Policy: Only authenticated users can insert transactions
DROP POLICY IF EXISTS "Treasury transactions can be inserted by authenticated users" ON treasury_transactions;
CREATE POLICY "Treasury transactions can be inserted by authenticated users"
  ON treasury_transactions
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy: Only authenticated users can update their own transactions
DROP POLICY IF EXISTS "Treasury transactions can be updated by authenticated users" ON treasury_transactions;
CREATE POLICY "Treasury transactions can be updated by authenticated users"
  ON treasury_transactions
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- =====================================================
-- 4. TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_treasury_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_treasury_transactions_updated_at ON treasury_transactions;
CREATE TRIGGER trigger_treasury_transactions_updated_at
  BEFORE UPDATE ON treasury_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_treasury_transactions_updated_at();

-- =====================================================
-- 5. GRANT PERMISSIONS
-- =====================================================

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON treasury_transactions TO authenticated;

-- Grant read-only permissions to anonymous users
GRANT SELECT ON treasury_transactions TO anon;

-- =====================================================
-- 6. VERIFICATION
-- =====================================================

-- Verify table was created
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'treasury_transactions'
  ) THEN
    RAISE NOTICE 'Table treasury_transactions created successfully';
  ELSE
    RAISE EXCEPTION 'Failed to create treasury_transactions table';
  END IF;
END $$;

-- Log completion
SELECT 'Migration 20251125000000_create_treasury_transactions completed successfully' as status;
