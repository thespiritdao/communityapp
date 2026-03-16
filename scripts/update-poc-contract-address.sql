-- =============================================================================
-- update-poc-contract-address.sql
--
-- Run this migration AFTER deploying ProofOfCuriosityV2 and AdvocateV2 contracts.
--
-- Steps to complete before running:
--   1. Deploy ProofOfCuriosityV2.sol → get deployed address
--   2. Deploy AdvocateV2.sol         → get deployed address
--   3. Replace the two placeholders below with the actual deployed addresses
--   4. Run this SQL against the production Supabase instance
--
-- Additional env var / config updates required AFTER this migration:
--   - Vercel env var: NEXT_PUBLIC_ADVOCATE  → set to new AdvocateV2 address
--   - Vercel env var: POC_CONTRACT_ADDRESS  → set to new ProofOfCuriosityV2 address (if used)
--   - Coinbase Paymaster whitelist: add both new contract addresses so gasless
--     minting works for users going through the CDP smart wallet flow
-- =============================================================================

-- Update ProofOfCuriosityV2 contract address
UPDATE tokens
SET contract_address = '0xNEW_POC_V2_ADDRESS',
    updated_at = NOW()
WHERE id = 'poc';

-- Update AdvocateV2 contract address
UPDATE tokens
SET contract_address = '0xNEW_ADVOCATE_V2_ADDRESS',
    updated_at = NOW()
WHERE id = 'advocate';

-- Verify both rows were updated
SELECT id, name, contract_address, updated_at
FROM tokens
WHERE id IN ('poc', 'advocate');
