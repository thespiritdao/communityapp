-- Update tokens table with proper contract addresses
-- Run this in Supabase SQL Editor

-- First, let's see what tokens exist without contract addresses
SELECT id, name, contract_address, token_type FROM tokens WHERE contract_address IS NULL OR contract_address = '';

-- Example updates - replace these addresses with your actual token contract addresses
-- Update Executive Pod token with contract address
UPDATE tokens 
SET contract_address = 'YOUR_EXECUTIVE_TOKEN_CONTRACT_ADDRESS'
WHERE id = 'exec' AND (contract_address IS NULL OR contract_address = '');

-- Update Dev Pod token with contract address  
UPDATE tokens
SET contract_address = 'YOUR_DEV_TOKEN_CONTRACT_ADDRESS'
WHERE id = 'dev' AND (contract_address IS NULL OR contract_address = '');

-- Update Bounty Management token with contract address
UPDATE tokens
SET contract_address = 'YOUR_BOUNTY_TOKEN_CONTRACT_ADDRESS'
WHERE id = 'bounty' AND (contract_address IS NULL OR contract_address = '');

-- Update Market Admin token with contract address
UPDATE tokens
SET contract_address = 'YOUR_MARKET_TOKEN_CONTRACT_ADDRESS'
WHERE id = 'market' AND (contract_address IS NULL OR contract_address = '');

-- Add constraint to ensure contract_address is required for active tokens going forward
ALTER TABLE tokens ADD CONSTRAINT tokens_contract_address_required 
CHECK (
    (is_active = false) OR 
    (is_active = true AND contract_address IS NOT NULL AND contract_address != '')
);

-- Verify the updates
SELECT id, name, contract_address, token_type, is_active FROM tokens;