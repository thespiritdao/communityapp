-- General Notifications Table for User Tagging
-- Run this in your Supabase SQL editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create general notifications table
CREATE TABLE IF NOT EXISTS general_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_address TEXT NOT NULL,
    sender_address TEXT NOT NULL,
    notification_type TEXT NOT NULL CHECK (notification_type IN (
        'user_mentioned', 'forum_reply', 'chat_message', 'bounty_update', 'proposal_executed', 'purchase_completed'
    )),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    context_url TEXT, -- URL to the content where the mention occurred
    context_type TEXT, -- 'forum', 'chat', 'bounty'
    context_id TEXT, -- ID of the forum post, chat message, or bounty
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_general_notifications_recipient ON general_notifications(recipient_address);
CREATE INDEX IF NOT EXISTS idx_general_notifications_read ON general_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_general_notifications_created_at ON general_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_general_notifications_type ON general_notifications(notification_type);

-- Enable Row Level Security
ALTER TABLE general_notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Anyone can read notifications" ON general_notifications
    FOR SELECT USING (true);

CREATE POLICY "Anyone can create notifications" ON general_notifications
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update notifications" ON general_notifications
    FOR UPDATE USING (true);

-- Create a function to get unread notification count
CREATE OR REPLACE FUNCTION get_unread_notification_count(user_address TEXT)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM general_notifications
        WHERE recipient_address = user_address
        AND is_read = FALSE
    );
END;
$$ LANGUAGE plpgsql;

-- Create a function to mark notifications as read
CREATE OR REPLACE FUNCTION mark_notifications_as_read(user_address TEXT, notification_ids UUID[] DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
    IF notification_ids IS NULL THEN
        -- Mark all notifications as read for the user
        UPDATE general_notifications
        SET is_read = TRUE
        WHERE recipient_address = user_address
        AND is_read = FALSE;
    ELSE
        -- Mark specific notifications as read
        UPDATE general_notifications
        SET is_read = TRUE
        WHERE recipient_address = user_address
        AND id = ANY(notification_ids);
    END IF;
END;
$$ LANGUAGE plpgsql; 