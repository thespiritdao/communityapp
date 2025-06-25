-- Bounty System Database Schema for Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Bounties table
CREATE TABLE IF NOT EXISTS bounties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    value_amount TEXT NOT NULL,
    value_token TEXT NOT NULL CHECK (value_token IN ('SYSTEM', 'SELF')),
    requirements TEXT[] DEFAULT '{}',
    questions TEXT[] DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in-progress', 'completed', 'cancelled')),
    creator_address TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bids table with enhanced fields
CREATE TABLE IF NOT EXISTS bids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bounty_id UUID NOT NULL REFERENCES bounties(id) ON DELETE CASCADE,
    bidder_address TEXT NOT NULL,
    experience TEXT NOT NULL,
    plan_of_action TEXT NOT NULL,
    deliverables JSONB DEFAULT '[]', -- Array of {description: string, due_date: string}
    timeline TEXT NOT NULL,
    proposed_amount TEXT NOT NULL,
    payment_option TEXT NOT NULL DEFAULT 'completion' CHECK (payment_option IN ('completion', 'milestones', 'split')),
    payment_details JSONB DEFAULT '{}', -- Payment schedule details
    answers JSONB DEFAULT '{}',
    additional_notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'archived')),
    reviewer_address TEXT, -- Who will review the work
    final_approver_address TEXT, -- Who will give final approval
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by TEXT
);

-- Bid reviews table for tracking review history
CREATE TABLE IF NOT EXISTS bid_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bid_id UUID NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    reviewer_address TEXT NOT NULL,
    review_type TEXT NOT NULL CHECK (review_type IN ('technical', 'final')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS bounty_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_address TEXT NOT NULL,
    bounty_id UUID REFERENCES bounties(id) ON DELETE CASCADE,
    bid_id UUID REFERENCES bids(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL CHECK (notification_type IN (
        'bid_submitted', 'bid_approved', 'bid_rejected', 'review_requested', 
        'deliverable_due', 'milestone_completed', 'bounty_completed'
    )),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Milestone tracking table
CREATE TABLE IF NOT EXISTS milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bid_id UUID NOT NULL REFERENCES bids(id) ON DELETE CASCADE,
    deliverable_description TEXT NOT NULL,
    due_date DATE NOT NULL,
    payment_amount TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'overdue')),
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_by TEXT,
    review_comments TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bounties_creator_address ON bounties(creator_address);
CREATE INDEX IF NOT EXISTS idx_bounties_status ON bounties(status);
CREATE INDEX IF NOT EXISTS idx_bounties_created_at ON bounties(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bids_bounty_id ON bids(bounty_id);
CREATE INDEX IF NOT EXISTS idx_bids_bidder_address ON bids(bidder_address);
CREATE INDEX IF NOT EXISTS idx_bids_status ON bids(status);
CREATE INDEX IF NOT EXISTS idx_bids_submitted_at ON bids(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_bid_reviews_bid_id ON bid_reviews(bid_id);
CREATE INDEX IF NOT EXISTS idx_bid_reviews_reviewer ON bid_reviews(reviewer_address);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON bounty_notifications(recipient_address);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON bounty_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_milestones_bid_id ON milestones(bid_id);
CREATE INDEX IF NOT EXISTS idx_milestones_due_date ON milestones(due_date);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for bounties table
CREATE TRIGGER update_bounties_updated_at 
    BEFORE UPDATE ON bounties 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for bid_reviews table
CREATE TRIGGER update_bid_reviews_updated_at 
    BEFORE UPDATE ON bid_reviews 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE bounties ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE bounty_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;

-- Bounties policies
CREATE POLICY "Anyone can read bounties" ON bounties
    FOR SELECT USING (true);

CREATE POLICY "Anyone can create bounties" ON bounties
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update bounties" ON bounties
    FOR UPDATE USING (true);

-- Bids policies
CREATE POLICY "Anyone can read bids" ON bids
    FOR SELECT USING (true);

CREATE POLICY "Anyone can create bids" ON bids
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update bids" ON bids
    FOR UPDATE USING (true);

-- Bid reviews policies
CREATE POLICY "Anyone can read bid reviews" ON bid_reviews
    FOR SELECT USING (true);

CREATE POLICY "Anyone can create bid reviews" ON bid_reviews
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update bid reviews" ON bid_reviews
    FOR UPDATE USING (true);

-- Notifications policies
CREATE POLICY "Anyone can read notifications" ON bounty_notifications
    FOR SELECT USING (true);

CREATE POLICY "Anyone can create notifications" ON bounty_notifications
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update notifications" ON bounty_notifications
    FOR UPDATE USING (true);

-- Milestones policies
CREATE POLICY "Anyone can read milestones" ON milestones
    FOR SELECT USING (true);

CREATE POLICY "Anyone can create milestones" ON milestones
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update milestones" ON milestones
    FOR UPDATE USING (true);

-- Create a view for bounty statistics
CREATE OR REPLACE VIEW bounty_stats AS
SELECT 
    COUNT(*) as total_bounties,
    COUNT(CASE WHEN status = 'open' THEN 1 END) as open_bounties,
    COUNT(CASE WHEN status = 'in-progress' THEN 1 END) as in_progress_bounties,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bounties,
    SUM(CASE WHEN status = 'completed' THEN CAST(value_amount AS NUMERIC) ELSE 0 END) as total_paid_out
FROM bounties;

-- Create a function to get bounty with bid count and status
CREATE OR REPLACE FUNCTION get_bounty_with_bid_count(bounty_uuid UUID)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    category TEXT,
    value_amount TEXT,
    value_token TEXT,
    requirements TEXT[],
    questions TEXT[],
    status TEXT,
    creator_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    bid_count BIGINT,
    pending_bids BIGINT,
    approved_bids BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.*,
        COALESCE(bid_counts.total_count, 0) as bid_count,
        COALESCE(bid_counts.pending_count, 0) as pending_bids,
        COALESCE(bid_counts.approved_count, 0) as approved_bids
    FROM bounties b
    LEFT JOIN (
        SELECT 
            bounty_id,
            COUNT(*) as total_count,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
            COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count
        FROM bids
        GROUP BY bounty_id
    ) bid_counts ON b.id = bid_counts.bounty_id
    WHERE b.id = bounty_uuid;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get bid with review status
CREATE OR REPLACE FUNCTION get_bid_with_reviews(bid_uuid UUID)
RETURNS TABLE (
    id UUID,
    bounty_id UUID,
    bidder_address TEXT,
    experience TEXT,
    plan_of_action TEXT,
    deliverables JSONB,
    timeline TEXT,
    proposed_amount TEXT,
    payment_option TEXT,
    payment_details JSONB,
    answers JSONB,
    additional_notes TEXT,
    status TEXT,
    reviewer_address TEXT,
    final_approver_address TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by TEXT,
    technical_review_status TEXT,
    final_review_status TEXT,
    milestone_count BIGINT,
    completed_milestones BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.*,
        COALESCE(tech_review.status, 'pending') as technical_review_status,
        COALESCE(final_review.status, 'pending') as final_review_status,
        COALESCE(milestone_stats.total_count, 0) as milestone_count,
        COALESCE(milestone_stats.completed_count, 0) as completed_milestones
    FROM bids b
    LEFT JOIN (
        SELECT bid_id, status
        FROM bid_reviews
        WHERE review_type = 'technical'
        ORDER BY created_at DESC
        LIMIT 1
    ) tech_review ON b.id = tech_review.bid_id
    LEFT JOIN (
        SELECT bid_id, status
        FROM bid_reviews
        WHERE review_type = 'final'
        ORDER BY created_at DESC
        LIMIT 1
    ) final_review ON b.id = final_review.bid_id
    LEFT JOIN (
        SELECT 
            bid_id,
            COUNT(*) as total_count,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count
        FROM milestones
        GROUP BY bid_id
    ) milestone_stats ON b.id = milestone_stats.bid_id
    WHERE b.id = bid_uuid;
END;
$$ LANGUAGE plpgsql;

-- Insert sample data for testing (optional)
-- INSERT INTO bounties (title, description, category, value_amount, value_token, requirements, questions, creator_address) VALUES
-- (
--     'Design New Logo',
--     'Create a modern logo for our DAO community that reflects our values of decentralization and innovation.',
--     'Design',
--     '100',
--     'SYSTEM',
--     ARRAY['Experience with vector graphics', 'Understanding of DAO culture', 'Portfolio of previous work'],
--     ARRAY['What is your design philosophy?', 'How would you approach making the logo scalable?', 'What tools do you prefer for logo design?'],
--     '0x1234567890123456789012345678901234567890'
-- ),
-- (
--     'Smart Contract Audit',
--     'Audit our governance smart contracts for security vulnerabilities and best practices.',
--     'Development',
--     '500',
--     'SELF',
--     ARRAY['Certified smart contract auditor', 'Experience with Solidity', 'Knowledge of common vulnerabilities'],
--     ARRAY['What audit tools do you use?', 'How do you approach formal verification?', 'What is your audit methodology?'],
--     '0x1234567890123456789012345678901234567890'
-- ); 