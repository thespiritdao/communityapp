-- Event Management System Database Schema for Supabase
-- Integrates with existing user_profiles, tokens, and user_pods tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Events table - Core event information
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    event_date TIMESTAMP WITH TIME ZONE NOT NULL,
    event_end_date TIMESTAMP WITH TIME ZONE,
    location TEXT,
    max_attendees INTEGER,
    
    -- Pricing and token info
    price_amount TEXT NOT NULL DEFAULT '0',
    price_token TEXT NOT NULL DEFAULT 'free' CHECK (price_token IN ('free', 'SELF', 'SYSTEM')),
    
    -- Token gating - which tokens are required to see/register for this event
    required_tokens TEXT[] DEFAULT '{}', -- Array of token IDs from tokens table
    
    -- Pod association - which pod is organizing this event
    organizing_pod_id TEXT REFERENCES tokens(id) ON DELETE SET NULL,
    
    -- Fund distribution - where collected tokens go
    fund_recipient_pod_id TEXT REFERENCES tokens(id) ON DELETE SET NULL,
    fund_recipient_type TEXT NOT NULL DEFAULT 'pod' CHECK (fund_recipient_type IN ('pod', 'dao')),
    
    -- Event creator and management
    creator_address TEXT NOT NULL,
    
    -- Event tokens/NFTs
    registration_contract_address TEXT, -- ERC721 contract for registration tokens
    completion_contract_address TEXT,   -- ERC721 contract for completion NFTs
    
    -- Status and metadata
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
    qr_code_data TEXT, -- For check-in QR codes
    
    -- Image and metadata
    event_image_url TEXT,
    event_metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event registrations table
CREATE TABLE IF NOT EXISTS event_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_address TEXT NOT NULL,
    
    -- Registration details
    registration_status TEXT NOT NULL DEFAULT 'registered' CHECK (registration_status IN ('registered', 'cancelled', 'checked_in', 'completed')),
    
    -- Token tracking
    registration_token_id TEXT, -- NFT token ID for registration
    completion_token_id TEXT,   -- NFT token ID for completion
    
    -- Payment tracking
    payment_amount TEXT DEFAULT '0',
    payment_token TEXT DEFAULT 'free',
    payment_tx_hash TEXT,
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'refunded')),
    
    -- Timestamps
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    checked_in_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Ensure unique registration per user per event
    UNIQUE(event_id, user_address)
);

-- Event agendas table - Agenda items within events
CREATE TABLE IF NOT EXISTS event_agendas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    
    title TEXT NOT NULL,
    description TEXT,
    agenda_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME,
    
    -- Ordering within the event
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event notifications table
CREATE TABLE IF NOT EXISTS event_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_address TEXT NOT NULL,
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    registration_id UUID REFERENCES event_registrations(id) ON DELETE CASCADE,
    
    notification_type TEXT NOT NULL CHECK (notification_type IN (
        'event_created', 'event_updated', 'event_cancelled',
        'registration_confirmed', 'registration_cancelled',
        'event_one_week_reminder', 'event_day_reminder',
        'event_starting_soon', 'event_completed',
        'check_in_required', 'completion_nft_ready'
    )),
    
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    context_url TEXT,
    
    -- Notification scheduling
    scheduled_for TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event tokens table - Track NFTs associated with events
CREATE TABLE IF NOT EXISTS event_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    
    token_type TEXT NOT NULL CHECK (token_type IN ('registration', 'completion')),
    contract_address TEXT NOT NULL,
    token_id TEXT NOT NULL,
    
    -- Token metadata
    token_name TEXT,
    token_description TEXT,
    token_image_url TEXT,
    token_metadata JSONB DEFAULT '{}',
    
    -- Owner tracking
    owner_address TEXT NOT NULL,
    minted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique token per contract
    UNIQUE(contract_address, token_id)
);

-- Event escrow table - Track escrowed funds
CREATE TABLE IF NOT EXISTS event_escrow (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    
    -- Escrow account details (Coinbase managed account)
    escrow_account_id TEXT NOT NULL,
    escrow_account_address TEXT,
    
    -- Token amounts
    total_self_amount TEXT DEFAULT '0',
    total_system_amount TEXT DEFAULT '0',
    
    -- Distribution tracking
    distributed BOOLEAN DEFAULT FALSE,
    distributed_at TIMESTAMP WITH TIME ZONE,
    distribution_tx_hash TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_events_creator_address ON events(creator_address);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_organizing_pod ON events(organizing_pod_id);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_required_tokens ON events USING GIN(required_tokens);

CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_user_address ON event_registrations(user_address);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON event_registrations(registration_status);
CREATE INDEX IF NOT EXISTS idx_registrations_registered_at ON event_registrations(registered_at DESC);

CREATE INDEX IF NOT EXISTS idx_agendas_event_id ON event_agendas(event_id);
CREATE INDEX IF NOT EXISTS idx_agendas_date_time ON event_agendas(agenda_date, start_time);
CREATE INDEX IF NOT EXISTS idx_agendas_sort_order ON event_agendas(event_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_event_notifications_recipient ON event_notifications(recipient_address);
CREATE INDEX IF NOT EXISTS idx_event_notifications_event_id ON event_notifications(event_id);
CREATE INDEX IF NOT EXISTS idx_event_notifications_type ON event_notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_event_notifications_scheduled ON event_notifications(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_event_notifications_sent ON event_notifications(sent_at);

CREATE INDEX IF NOT EXISTS idx_event_tokens_event_id ON event_tokens(event_id);
CREATE INDEX IF NOT EXISTS idx_event_tokens_owner ON event_tokens(owner_address);
CREATE INDEX IF NOT EXISTS idx_event_tokens_contract ON event_tokens(contract_address);

CREATE INDEX IF NOT EXISTS idx_event_escrow_event_id ON event_escrow(event_id);

-- Create updated_at trigger function (reuse existing one if available)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_events_updated_at 
    BEFORE UPDATE ON events 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_event_agendas_updated_at 
    BEFORE UPDATE ON event_agendas 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_agendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_escrow ENABLE ROW LEVEL SECURITY;

-- Events policies - Token gating will be implemented at application level
CREATE POLICY "Anyone can read published events" ON events
    FOR SELECT USING (status = 'published');

CREATE POLICY "Creators can manage their events" ON events
    FOR ALL USING (creator_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

CREATE POLICY "Anyone can create events" ON events
    FOR INSERT WITH CHECK (true);

-- Event registrations policies
CREATE POLICY "Users can read their own registrations" ON event_registrations
    FOR SELECT USING (user_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

CREATE POLICY "Event creators can read registrations for their events" ON event_registrations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM events 
            WHERE events.id = event_registrations.event_id 
            AND events.creator_address = current_setting('request.jwt.claims', true)::json->>'wallet_address'
        )
    );

CREATE POLICY "Anyone can register for events" ON event_registrations
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own registrations" ON event_registrations
    FOR UPDATE USING (user_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

-- Event agendas policies
CREATE POLICY "Anyone can read event agendas" ON event_agendas
    FOR SELECT USING (true);

CREATE POLICY "Event creators can manage agendas" ON event_agendas
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM events 
            WHERE events.id = event_agendas.event_id 
            AND events.creator_address = current_setting('request.jwt.claims', true)::json->>'wallet_address'
        )
    );

-- Event notifications policies  
CREATE POLICY "Users can read their own notifications" ON event_notifications
    FOR SELECT USING (recipient_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

CREATE POLICY "System can create notifications" ON event_notifications
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own notifications" ON event_notifications
    FOR UPDATE USING (recipient_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

-- Event tokens policies
CREATE POLICY "Anyone can read event tokens" ON event_tokens
    FOR SELECT USING (true);

CREATE POLICY "System can manage event tokens" ON event_tokens
    FOR ALL WITH CHECK (true);

-- Event escrow policies
CREATE POLICY "Event creators can read escrow for their events" ON event_escrow
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM events 
            WHERE events.id = event_escrow.event_id 
            AND events.creator_address = current_setting('request.jwt.claims', true)::json->>'wallet_address'
        )
    );

CREATE POLICY "System can manage escrow" ON event_escrow
    FOR ALL WITH CHECK (true);

-- Create views for common queries
CREATE OR REPLACE VIEW event_stats AS
SELECT 
    COUNT(*) as total_events,
    COUNT(CASE WHEN status = 'published' THEN 1 END) as published_events,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_events,
    COUNT(CASE WHEN event_date > NOW() THEN 1 END) as upcoming_events,
    COUNT(CASE WHEN event_date < NOW() AND status = 'published' THEN 1 END) as past_events
FROM events;

-- View for events with registration counts
CREATE OR REPLACE VIEW events_with_stats AS
SELECT 
    e.*,
    COALESCE(reg_stats.registration_count, 0) as registration_count,
    COALESCE(reg_stats.checked_in_count, 0) as checked_in_count,
    COALESCE(reg_stats.completed_count, 0) as completed_count
FROM events e
LEFT JOIN (
    SELECT 
        event_id,
        COUNT(*) as registration_count,
        COUNT(CASE WHEN registration_status = 'checked_in' THEN 1 END) as checked_in_count,
        COUNT(CASE WHEN registration_status = 'completed' THEN 1 END) as completed_count
    FROM event_registrations
    WHERE registration_status != 'cancelled'
    GROUP BY event_id
) reg_stats ON e.id = reg_stats.event_id;

-- Functions for common operations
CREATE OR REPLACE FUNCTION get_user_events(user_wallet_address TEXT)
RETURNS TABLE (
    event_id UUID,
    title TEXT,
    event_date TIMESTAMP WITH TIME ZONE,
    registration_status TEXT,
    registered_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.title,
        e.event_date,
        er.registration_status,
        er.registered_at
    FROM events e
    JOIN event_registrations er ON e.id = er.event_id
    WHERE er.user_address = user_wallet_address
    ORDER BY e.event_date DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user can register for event (basic version - token gating handled in app)
CREATE OR REPLACE FUNCTION can_user_register_for_event(event_uuid UUID, user_wallet_address TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    event_record events%ROWTYPE;
    existing_registration INTEGER;
BEGIN
    -- Get event details
    SELECT * INTO event_record FROM events WHERE id = event_uuid;
    
    -- Check if event exists and is published
    IF NOT FOUND OR event_record.status != 'published' THEN
        RETURN FALSE;
    END IF;
    
    -- Check if event is in the future
    IF event_record.event_date <= NOW() THEN
        RETURN FALSE;
    END IF;
    
    -- Check if user is already registered
    SELECT COUNT(*) INTO existing_registration 
    FROM event_registrations 
    WHERE event_id = event_uuid 
    AND user_address = user_wallet_address 
    AND registration_status != 'cancelled';
    
    IF existing_registration > 0 THEN
        RETURN FALSE;
    END IF;
    
    -- Check max attendees
    IF event_record.max_attendees IS NOT NULL THEN
        SELECT COUNT(*) INTO existing_registration
        FROM event_registrations
        WHERE event_id = event_uuid
        AND registration_status IN ('registered', 'checked_in', 'completed');
        
        IF existing_registration >= event_record.max_attendees THEN
            RETURN FALSE;
        END IF;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;