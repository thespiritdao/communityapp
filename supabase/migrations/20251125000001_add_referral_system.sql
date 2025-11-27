-- Migration: Add Referral/Invite System to user_profiles
-- Created: 2025-11-25
-- Purpose: Enable invite-only onboarding with referral tracking

-- Add referral system columns to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS referral_key VARCHAR(6) UNIQUE,
ADD COLUMN IF NOT EXISTS invited_by TEXT,
ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMP WITH TIME ZONE;

-- Create index for fast referral key lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_referral_key ON user_profiles(referral_key);

-- Create index for invited_by for analytics
CREATE INDEX IF NOT EXISTS idx_user_profiles_invited_by ON user_profiles(invited_by);

-- Add comment explaining the columns
COMMENT ON COLUMN user_profiles.referral_key IS 'Unique 6-character invite code (alphanumeric) assigned to each user';
COMMENT ON COLUMN user_profiles.invited_by IS 'Wallet address of the user who invited this user';
COMMENT ON COLUMN user_profiles.onboarded_at IS 'Timestamp when user completed onboarding and was granted access';

-- Update RLS policies to allow reading referral keys for validation
CREATE POLICY "Allow public read access to referral keys"
  ON user_profiles FOR SELECT
  USING (referral_key IS NOT NULL);

-- Function to generate unique referral key
CREATE OR REPLACE FUNCTION generate_referral_key()
RETURNS VARCHAR(6) AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Exclude confusing chars (0,O,I,1)
  result VARCHAR(6) := '';
  i INT;
  key_exists BOOLEAN;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;

    -- Check if key already exists
    SELECT EXISTS(SELECT 1 FROM user_profiles WHERE referral_key = result) INTO key_exists;

    EXIT WHEN NOT key_exists;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate referral key on user creation
CREATE OR REPLACE FUNCTION auto_generate_referral_key()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_key IS NULL THEN
    NEW.referral_key := generate_referral_key();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_generate_referral_key
  BEFORE INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_referral_key();

-- Backfill existing users with referral keys
UPDATE user_profiles
SET referral_key = generate_referral_key()
WHERE referral_key IS NULL;

-- Make referral_key NOT NULL after backfill
ALTER TABLE user_profiles
ALTER COLUMN referral_key SET NOT NULL;

-- Create referral_validations table for tracking invite code usage
CREATE TABLE IF NOT EXISTS referral_validations (
  id BIGSERIAL PRIMARY KEY,
  invite_code VARCHAR(6) NOT NULL,
  used_by_wallet TEXT NOT NULL,
  validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  referrer_wallet TEXT,
  CONSTRAINT fk_referrer FOREIGN KEY (referrer_wallet) REFERENCES user_profiles(wallet_address)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_referral_validations_code ON referral_validations(invite_code);
CREATE INDEX IF NOT EXISTS idx_referral_validations_wallet ON referral_validations(used_by_wallet);

-- Enable RLS on referral_validations
ALTER TABLE referral_validations ENABLE ROW LEVEL SECURITY;

-- Allow public read for validation checking
CREATE POLICY "Allow public read access to referral validations"
  ON referral_validations FOR SELECT
  USING (true);

-- Allow insert for new validations
CREATE POLICY "Allow insert for referral validations"
  ON referral_validations FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE referral_validations IS 'Tracks invite code usage for analytics and preventing reuse';
