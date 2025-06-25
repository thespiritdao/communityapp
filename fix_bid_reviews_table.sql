-- Create bid_reviews table if it doesn't exist
-- Run this in your Supabase SQL editor

-- Create bid_reviews table
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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bid_reviews_bid_id ON bid_reviews(bid_id);
CREATE INDEX IF NOT EXISTS idx_bid_reviews_reviewer ON bid_reviews(reviewer_address);
CREATE INDEX IF NOT EXISTS idx_bid_reviews_review_type ON bid_reviews(review_type);
CREATE INDEX IF NOT EXISTS idx_bid_reviews_status ON bid_reviews(status);

-- Enable RLS
ALTER TABLE bid_reviews ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Anyone can read bid reviews" ON bid_reviews
    FOR SELECT USING (true);

CREATE POLICY "Anyone can create bid reviews" ON bid_reviews
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update bid reviews" ON bid_reviews
    FOR UPDATE USING (true);

-- Create updated_at trigger for bid_reviews table
CREATE TRIGGER update_bid_reviews_updated_at 
    BEFORE UPDATE ON bid_reviews 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Verify the table was created
SELECT table_name, column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'bid_reviews' 
ORDER BY ordinal_position; 