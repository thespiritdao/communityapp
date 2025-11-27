-- Fix missing columns in pods table (Supabase-compatible version)
-- This addresses the error: Could not find the 'is_active' column of 'pods' in the schema cache

-- Ensure columns exist (explicit schema filter)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pods' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.pods ADD COLUMN is_active BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pods' AND column_name = 'treasury_address'
  ) THEN
    ALTER TABLE public.pods ADD COLUMN treasury_address TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pods' AND column_name = 'treasury_deployed_at'
  ) THEN
    ALTER TABLE public.pods ADD COLUMN treasury_deployed_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pods' AND column_name = 'factory_address'
  ) THEN
    ALTER TABLE public.pods ADD COLUMN factory_address TEXT;
  END IF;
END
$$;

-- Update existing pods to be active by default if they have a management_hat_id
UPDATE public.pods
SET is_active = true
WHERE management_hat_id IS NOT NULL
  AND management_hat_id <> ''
  AND (is_active IS NULL OR is_active = false);

-- Create indexes (NO CONCURRENTLY — compatible with Supabase SQL editor)
CREATE INDEX IF NOT EXISTS idx_pods_is_active ON public.pods(is_active);
CREATE INDEX IF NOT EXISTS idx_pods_treasury_address
  ON public.pods(treasury_address)
  WHERE treasury_address IS NOT NULL;

-- Simplified RLS policy (no reference to non-existent user_hats table)
DROP POLICY IF EXISTS "Allow treasury operations for pod managers" ON public.pods;
CREATE POLICY "Allow treasury operations for pod managers" ON public.pods
  FOR UPDATE
  USING (
    -- Only check pod_leads array (assuming it's TEXT[])
    auth.uid()::text = ANY(pod_leads)
  );

-- Grant necessary permissions
GRANT SELECT, UPDATE ON public.pods TO authenticated;
GRANT SELECT ON public.pods TO anon;

-- Create a view for active pods with treasuries
CREATE OR REPLACE VIEW public.active_pods_with_treasuries AS
SELECT
  p.*,
  (p.treasury_address IS NOT NULL) AS has_treasury
FROM public.pods p
WHERE p.is_active = true;

GRANT SELECT ON public.active_pods_with_treasuries TO authenticated;
GRANT SELECT ON public.active_pods_with_treasuries TO anon;

-- Helpful docs/comments
COMMENT ON TABLE public.pods IS 'Pod management with treasury integration - includes treasury deployment tracking';
COMMENT ON COLUMN public.pods.is_active IS 'Whether the pod is currently active and operational';
COMMENT ON COLUMN public.pods.treasury_address IS 'Contract address of the deployed pod treasury';
COMMENT ON COLUMN public.pods.treasury_deployed_at IS 'Timestamp when treasury was deployed';
COMMENT ON COLUMN public.pods.factory_address IS 'Address of the factory contract that deployed the treasury';

-- Force PostgREST to refresh schema so API reads the new columns immediately
SELECT pg_notify('pgrst','reload schema');