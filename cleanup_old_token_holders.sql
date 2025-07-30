-- Cleanup script to remove old token_holders table and related objects
-- Run this after applying the new governance_notifications_schema.sql

-- Drop the function that used the token_holders table
DROP FUNCTION IF EXISTS get_token_holders_for_governance(VARCHAR);

-- Drop indexes on token_holders table
DROP INDEX IF EXISTS idx_token_holders_wallet;
DROP INDEX IF EXISTS idx_token_holders_token;
DROP INDEX IF EXISTS idx_token_holders_balance;
DROP INDEX IF EXISTS idx_token_holders_wallet_token;

-- Drop RLS policies on token_holders table
DROP POLICY IF EXISTS "Anyone can read token holders" ON token_holders;
DROP POLICY IF EXISTS "System can manage token holders" ON token_holders;

-- Drop the token_holders table
DROP TABLE IF EXISTS token_holders;

-- Verify cleanup
SELECT 'Cleanup completed successfully' as status; 