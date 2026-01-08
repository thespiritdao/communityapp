-- Add Advocate NFT to tokens table for Identity page display
-- This allows the DatabaseTokenGallery component to show Advocate NFTs

INSERT INTO tokens (
  name,
  description,
  contract_address,
  token_type,
  token_image,
  is_active,
  created_at
) VALUES (
  'Advocate NFT',
  'Governance voting token that grants proposal creation rights',
  '0x592E560171D2a882474cdfc3BbeeDb21cEB4015d',
  'erc20',
  '/images/symbolobinfin.png',
  true,
  NOW()
)
ON CONFLICT (contract_address)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  token_type = EXCLUDED.token_type,
  token_image = EXCLUDED.token_image,
  is_active = EXCLUDED.is_active;
