-- Governance Notifications Table
CREATE TABLE IF NOT EXISTS governance_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recipient_address VARCHAR(42) NOT NULL,
    sender_address VARCHAR(42) NOT NULL,
    notification_type VARCHAR(50) NOT NULL CHECK (
        notification_type IN (
            'proposal_mentioned',
            'proposal_created', 
            'proposal_voted',
            'proposal_executed',
            'proposal_cancelled',
            'token_holder_notification'
        )
    ),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    context_url TEXT,
    context_type VARCHAR(50) DEFAULT 'governance',
    context_id VARCHAR(255),
    proposal_id VARCHAR(255),
    transaction_hash VARCHAR(66),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: Token holders are now determined dynamically using fetchTokenBalances.ts
-- This approach leverages your existing token balance checking system
-- and eliminates the need for a separate token_holders table

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_governance_notifications_recipient ON governance_notifications(recipient_address);
CREATE INDEX IF NOT EXISTS idx_governance_notifications_read ON governance_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_governance_notifications_created_at ON governance_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_governance_notifications_proposal_id ON governance_notifications(proposal_id);
CREATE INDEX IF NOT EXISTS idx_governance_notifications_type ON governance_notifications(notification_type);

-- Note: Token holder indexes removed since we're using dynamic token balance checking

-- Add token_id column to existing proposal_metadata table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'proposal_metadata' 
        AND column_name = 'token_id'
    ) THEN
        ALTER TABLE proposal_metadata ADD COLUMN token_id VARCHAR(50);
    END IF;
END $$;

-- Create index for token_id in proposal_metadata
CREATE INDEX IF NOT EXISTS idx_proposal_metadata_token_id ON proposal_metadata(token_id);

-- Enable Row Level Security (RLS)
ALTER TABLE governance_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for governance_notifications
-- Users can only see their own notifications
CREATE POLICY "Users can view own governance notifications" ON governance_notifications
    FOR SELECT USING (recipient_address = current_setting('request.jwt.claims', true)::json->>'sub');

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own governance notifications" ON governance_notifications
    FOR UPDATE USING (recipient_address = current_setting('request.jwt.claims', true)::json->>'sub');

-- System can insert notifications for any user
CREATE POLICY "System can insert governance notifications" ON governance_notifications
    FOR INSERT WITH CHECK (true);

-- Note: Token holder RLS policies removed since we're using dynamic token balance checking

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_governance_notifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_governance_notifications_updated_at
    BEFORE UPDATE ON governance_notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_governance_notifications_updated_at();

-- Function to get unread governance notification count
CREATE OR REPLACE FUNCTION get_unread_governance_notification_count(user_address VARCHAR)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM governance_notifications
        WHERE recipient_address = user_address
        AND is_read = FALSE
    );
END;
$$ LANGUAGE plpgsql;

-- Function to mark all governance notifications as read for a user
CREATE OR REPLACE FUNCTION mark_all_governance_notifications_read(user_address VARCHAR)
RETURNS VOID AS $$
BEGIN
    UPDATE governance_notifications
    SET is_read = TRUE, updated_at = NOW()
    WHERE recipient_address = user_address
    AND is_read = FALSE;
END;
$$ LANGUAGE plpgsql;

-- Note: get_token_holders_for_governance function removed since we're using fetchTokenBalances.ts
-- This approach provides real-time token balance checking instead of cached data 