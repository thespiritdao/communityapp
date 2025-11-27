-- Fix RLS policies for event_registrations to work with actual schema
-- The original policies assumed a user_id column that doesn't exist

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Authenticated users can register for events" ON event_registrations;
DROP POLICY IF EXISTS "Users can update their own registrations" ON event_registrations;
DROP POLICY IF EXISTS "Authenticated users can read their own registrations by address" ON event_registrations;

-- Create new policies that work with user_address instead of user_id
CREATE POLICY "Authenticated users can register for events by wallet" ON event_registrations
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND 
        user_address IN (
            SELECT wallet_address 
            FROM user_profiles 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own registrations by wallet" ON event_registrations
    FOR UPDATE USING (
        auth.uid() IS NOT NULL AND 
        user_address IN (
            SELECT wallet_address 
            FROM user_profiles 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can read their own registrations by wallet" ON event_registrations
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND 
        user_address IN (
            SELECT wallet_address 
            FROM user_profiles 
            WHERE user_id = auth.uid()
        )
    );

-- Fix event_notifications RLS policies too
DROP POLICY IF EXISTS "Authenticated users can create notifications" ON event_notifications;
DROP POLICY IF EXISTS "Users can read their own notifications" ON event_notifications;

CREATE POLICY "Authenticated users can create notifications by wallet" ON event_notifications
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL AND 
        recipient_address IN (
            SELECT wallet_address 
            FROM user_profiles 
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can read their own notifications by wallet" ON event_notifications
    FOR SELECT USING (
        auth.uid() IS NOT NULL AND 
        recipient_address IN (
            SELECT wallet_address 
            FROM user_profiles 
            WHERE user_id = auth.uid()
        )
    );