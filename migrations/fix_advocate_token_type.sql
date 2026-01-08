-- Fix Advocate NFT token type
-- Advocate is an ERC-20 governance token, not ERC-721
-- This was causing balance checks to fail

UPDATE tokens
SET
  token_type = 'erc20',
  name = 'Advocate NFT',
  description = 'Governance voting token that grants proposal creation rights'
WHERE contract_address = '0x592E560171D2a882474cdfc3BbeeDb21cEB4015d';
