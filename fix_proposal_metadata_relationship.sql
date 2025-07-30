-- Add foreign key relationship between proposal_metadata and user_profiles tables
-- This is optional - the current code works without it by making separate queries

-- First, ensure the user_profiles table has the wallet_address column as primary key or unique
ALTER TABLE user_profiles 
ADD CONSTRAINT IF NOT EXISTS user_profiles_wallet_address_unique 
UNIQUE (wallet_address);

-- Add foreign key constraint (optional - can be commented out if not needed)
-- ALTER TABLE proposal_metadata 
-- ADD CONSTRAINT fk_proposal_metadata_proposer 
-- FOREIGN KEY (proposer_address) REFERENCES user_profiles(wallet_address);

-- Add index for better performance on the join
CREATE INDEX IF NOT EXISTS idx_proposal_metadata_proposer_address 
ON proposal_metadata(proposer_address);

-- Add index on user_profiles wallet_address if not exists
CREATE INDEX IF NOT EXISTS idx_user_profiles_wallet_address 
ON user_profiles(wallet_address); 