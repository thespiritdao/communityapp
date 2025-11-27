-- Treasury Transactions Table
-- Stores rich transaction metadata for better UX than blockchain parsing

CREATE TABLE treasury_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Transaction identification
    tx_hash TEXT UNIQUE, -- blockchain transaction hash (set when confirmed)
    pod_id UUID NOT NULL,
    treasury_address TEXT NOT NULL,
    
    -- Transaction details
    type TEXT NOT NULL CHECK (type IN ('deposit', 'distribution', 'withdrawal')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    
    -- Token information (stored for rich display)
    token_address TEXT NOT NULL,
    token_symbol TEXT NOT NULL,
    token_decimals INTEGER NOT NULL DEFAULT 18,
    amount_raw TEXT NOT NULL, -- raw amount in wei/smallest unit
    amount_formatted TEXT NOT NULL, -- human readable amount
    
    -- User information
    sender_address TEXT,
    recipient_address TEXT,
    sender_name TEXT, -- cached user name for display
    recipient_name TEXT, -- cached user name for display
    
    -- Additional metadata
    reason TEXT,
    transaction_data JSONB, -- store additional context
    
    -- Blockchain confirmation
    block_number BIGINT,
    block_timestamp TIMESTAMP WITH TIME ZONE,
    gas_used BIGINT
);

-- Create indexes for fast queries
CREATE INDEX treasury_transactions_pod_id_idx ON treasury_transactions(pod_id, created_at DESC);
CREATE INDEX treasury_transactions_treasury_address_idx ON treasury_transactions(treasury_address);
CREATE INDEX treasury_transactions_tx_hash_idx ON treasury_transactions(tx_hash);
CREATE INDEX treasury_transactions_status_idx ON treasury_transactions(status);
CREATE INDEX treasury_transactions_type_idx ON treasury_transactions(type);

-- RLS Policies
ALTER TABLE treasury_transactions ENABLE ROW LEVEL SECURITY;

-- For now, allow authenticated users to view all transactions (simplify for testing)
CREATE POLICY "Users can view treasury transactions" 
ON treasury_transactions FOR SELECT 
TO authenticated 
USING (true);

-- Allow authenticated users to insert transactions
CREATE POLICY "Users can create treasury transactions" 
ON treasury_transactions FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow authenticated users to update transactions
CREATE POLICY "Users can update treasury transactions" 
ON treasury_transactions FOR UPDATE 
TO authenticated 
USING (true);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_treasury_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_treasury_transactions_updated_at
    BEFORE UPDATE ON treasury_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_treasury_transactions_updated_at();