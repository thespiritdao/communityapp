-- CRITICAL PERFORMANCE FIX: Add index on wallet_address
-- This makes lookups by wallet_address 100-1000x faster

-- Run this in Supabase SQL Editor:

-- Create index on wallet_address (if it doesn't exist)
CREATE INDEX IF NOT EXISTS idx_user_profiles_wallet_address
ON public.user_profiles(wallet_address);

-- Verify index was created
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'user_profiles'
  AND indexname = 'idx_user_profiles_wallet_address';
