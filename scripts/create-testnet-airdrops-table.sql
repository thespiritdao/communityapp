-- Create testnet_airdrops table for tracking token airdrops
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.testnet_airdrops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  system_amount TEXT NOT NULL,
  self_amount TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  airdropped_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for efficient wallet address lookups
CREATE INDEX IF NOT EXISTS idx_testnet_airdrops_wallet
  ON public.testnet_airdrops(wallet_address);

-- Index for transaction tracking
CREATE INDEX IF NOT EXISTS idx_testnet_airdrops_tx
  ON public.testnet_airdrops(transaction_hash);

-- Enable Row Level Security
ALTER TABLE public.testnet_airdrops ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access (for API routes)
CREATE POLICY "Service role full access"
  ON public.testnet_airdrops
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Public can view airdrops (read-only)
CREATE POLICY "Public read access"
  ON public.testnet_airdrops
  FOR SELECT
  TO public
  USING (true);

-- Add comment
COMMENT ON TABLE public.testnet_airdrops IS 'Tracks token airdrops to user wallets for audit trail';
