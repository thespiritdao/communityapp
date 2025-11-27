-- =====================================================
-- GIFTS TABLE
-- =====================================================
-- Tracks gifts (token transfers) between users
-- Used for analytics and gift history display

CREATE TABLE IF NOT EXISTS gifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    token TEXT NOT NULL CHECK (token IN ('SYSTEM', 'SELF')),
    amount TEXT NOT NULL,
    message TEXT,
    transaction_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gifts_sender ON gifts(sender_id);
CREATE INDEX IF NOT EXISTS idx_gifts_recipient ON gifts(recipient_id);
CREATE INDEX IF NOT EXISTS idx_gifts_created_at ON gifts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gifts_transaction ON gifts(transaction_hash);

-- RLS Policies
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;

-- Users can view gifts they sent or received
-- Note: sender_id and recipient_id are wallet addresses stored as TEXT
CREATE POLICY "Users can view their own gifts"
    ON gifts
    FOR SELECT
    USING (
        sender_id = current_setting('request.jwt.claims', true)::json->>'wallet_address'
        OR recipient_id = current_setting('request.jwt.claims', true)::json->>'wallet_address'
    );

-- Users can insert gifts (sender must match authenticated user)
CREATE POLICY "Users can send gifts"
    ON gifts
    FOR INSERT
    WITH CHECK (
        sender_id = current_setting('request.jwt.claims', true)::json->>'wallet_address'
    );

-- Add comments for documentation
COMMENT ON TABLE gifts IS 'Tracks token gifts between users for analytics';
COMMENT ON COLUMN gifts.sender_id IS 'Wallet address of the sender';
COMMENT ON COLUMN gifts.recipient_id IS 'Wallet address of the recipient';
COMMENT ON COLUMN gifts.token IS 'Token type: SYSTEM or SELF';
COMMENT ON COLUMN gifts.amount IS 'Amount of tokens sent (stored as string to preserve decimals)';
COMMENT ON COLUMN gifts.message IS 'Optional message attached to the gift';
COMMENT ON COLUMN gifts.transaction_hash IS 'On-chain transaction hash';
