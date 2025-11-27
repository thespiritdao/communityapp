-- Fix RLS policies for event_registrations to work with wallet-based auth

-- Ensure plpgsql language is available (usually enabled by default in Supabase)
CREATE EXTENSION IF NOT EXISTS plpgsql;

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can read their own registrations" ON event_registrations;
DROP POLICY IF EXISTS "Event creators can read registrations for their events" ON event_registrations;

-- Create more permissive policies that work with our authentication system
CREATE POLICY "Authenticated users can read event registrations" ON event_registrations
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read their own registrations by address" ON event_registrations
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND 
        user_address IN (
            SELECT wallet_address 
            FROM user_profiles 
            WHERE user_id = auth.uid()
        )
    );

-- Add INSERT policy for authenticated users to register for events
CREATE POLICY "Authenticated users can register for events" ON event_registrations
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND 
        user_id = auth.uid() AND
        user_address IN (
            SELECT wallet_address 
            FROM user_profiles 
            WHERE user_id = auth.uid()
        )
    );

-- Add UPDATE policy for users to update their own registrations
CREATE POLICY "Users can update their own registrations" ON event_registrations
    FOR UPDATE USING (
        auth.uid() IS NOT NULL AND 
        user_id = auth.uid() AND
        user_address IN (
            SELECT wallet_address 
            FROM user_profiles 
            WHERE user_id = auth.uid()
        )
    );

-- Create an RPC function to get user registration with proper auth
CREATE OR REPLACE FUNCTION get_user_registration(
    p_event_id UUID,
    p_user_address TEXT
)
RETURNS TABLE (
    id UUID,
    event_id UUID,
    user_address TEXT,
    registration_status TEXT,
    payment_status TEXT,
    payment_amount TEXT,
    payment_token TEXT,
    payment_transaction_hash TEXT,
    registered_at timestamptz,
    checked_in_at timestamptz,
    cancelled_at timestamptz,
    completed_at timestamptz,
    qr_code_data TEXT,
    qr_generated_at timestamptz,
    check_in_method TEXT,
    created_at timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if user is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Check if the user_address belongs to the authenticated user
    IF NOT EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_id = auth.uid() 
        AND wallet_address = p_user_address
    ) THEN
        RAISE EXCEPTION 'Access denied: wallet address does not belong to authenticated user';
    END IF;

    -- Return the registration
    RETURN QUERY
    SELECT er.id, er.event_id, er.user_address, er.registration_status, er.payment_status,
           er.payment_amount, er.payment_token, er.payment_transaction_hash,
           er.registered_at, er.checked_in_at, er.cancelled_at, er.completed_at,
           er.qr_code_data, er.qr_generated_at, er.check_in_method,
           er.created_at, er.updated_at
    FROM event_registrations er
    WHERE er.event_id = p_event_id 
    AND er.user_address = p_user_address;
END;
$$;