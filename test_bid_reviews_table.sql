-- Test if bid_reviews table exists and check its structure
-- Run this in your Supabase SQL editor

-- Check if table exists
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name = 'bid_reviews'
) as table_exists;

-- If table exists, show its structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'bid_reviews' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if there are any existing records
SELECT COUNT(*) as record_count FROM bid_reviews; 