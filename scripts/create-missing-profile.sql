-- Create Missing User Profile for Current Auth Session
-- Run this in Supabase SQL Editor while logged in as yourself

-- IMPORTANT: Update the wallet_address below to your actual wallet!
-- Replace '0xYOUR_WALLET_HERE' with your real wallet address

INSERT INTO user_profiles (
  user_id,
  wallet_address,
  email
)
VALUES (
  auth.uid(),
  '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48', -- ⚠️  VERIFY THIS IS YOUR WALLET
  auth.email()
)
ON CONFLICT (user_id) DO UPDATE
SET
  wallet_address = EXCLUDED.wallet_address,
  email = EXCLUDED.email;

-- Verify it worked
SELECT
  'Verification' as step,
  user_id,
  wallet_address,
  email,
  CASE
    WHEN user_id = auth.uid() THEN '✅ Successfully created/updated my profile'
    ELSE '❌ Wrong profile'
  END as status
FROM user_profiles
WHERE user_id = auth.uid();
