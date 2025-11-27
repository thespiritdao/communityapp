-- Clean up tokens table to only contain actual tokens, not pod access tokens
-- Run this in Supabase SQL Editor

-- First, let's see what we're removing
SELECT 
  'tokens_to_remove' as action,
  id, 
  name, 
  token_type,
  contract_address,
  CASE 
    WHEN id IN ('exec', 'community') THEN 'Pod access - should be managed via pods table'
    ELSE 'Keep - actual token'
  END as reasoning
FROM tokens 
ORDER BY 
  CASE WHEN id IN ('exec', 'community') THEN 1 ELSE 0 END,
  name;

-- Check if any events reference the tokens we're about to remove
SELECT 
  'events_using_removed_tokens' as check_type,
  organizing_pod_id,
  fund_recipient_pod_id,
  COUNT(*) as events_count
FROM events 
WHERE organizing_pod_id IN ('exec', 'community') 
   OR fund_recipient_pod_id IN ('exec', 'community')
GROUP BY organizing_pod_id, fund_recipient_pod_id;

-- Check if any required_tokens arrays reference these
SELECT 
  'events_required_tokens_check' as check_type,
  id,
  title,
  required_tokens
FROM events 
WHERE required_tokens && ARRAY['exec', 'community'];

-- If the above queries show no dependencies, proceed with removal
-- UNCOMMENT the following lines after verifying no dependencies:

-- Remove pod access tokens that are now managed via pods table
-- DELETE FROM tokens WHERE id IN ('exec', 'community');

-- Add a comment to clarify the purpose of the tokens table
COMMENT ON TABLE tokens IS 'Contains community currencies and membership tokens only. Pod access is managed via the pods table with HAT IDs.';

-- Verify final state
SELECT 
  'final_tokens_table' as result,
  id,
  name,
  token_type,
  contract_address,
  is_active
FROM tokens 
ORDER BY name;