-- Enhanced QR Code System Database Schema Updates
-- Run these updates to support the enhanced QR code check-in system

-- Add enhanced QR code fields to events table
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS enhanced_qr_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS qr_signature_key TEXT,
ADD COLUMN IF NOT EXISTS qr_expiry_hours INTEGER DEFAULT 24;

-- Add enhanced fields to event_registrations table
ALTER TABLE event_registrations
ADD COLUMN IF NOT EXISTS qr_signature TEXT,
ADD COLUMN IF NOT EXISTS qr_generated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS qr_used_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS check_in_method TEXT DEFAULT 'manual' CHECK (check_in_method IN ('manual', 'qr_scan', 'nfc', 'biometric')),
ADD COLUMN IF NOT EXISTS check_in_device_info JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS user_profile_snapshot JSONB DEFAULT '{}';

-- Create QR code audit table for security tracking
CREATE TABLE IF NOT EXISTS qr_code_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    registration_id UUID REFERENCES event_registrations(id) ON DELETE CASCADE,
    
    -- QR code details
    qr_data_hash TEXT NOT NULL,
    qr_signature TEXT,
    scan_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Scanner details
    scanner_address TEXT,
    scanner_device_info JSONB DEFAULT '{}',
    scanner_location JSONB DEFAULT '{}',
    
    -- Validation results
    validation_result TEXT NOT NULL CHECK (validation_result IN ('success', 'expired', 'invalid_signature', 'wrong_event', 'already_used', 'insufficient_tokens')),
    validation_details JSONB DEFAULT '{}',
    
    -- Action taken
    action_taken TEXT CHECK (action_taken IN ('check_in', 'rejected', 'manual_override')),
    action_by TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create enhanced attendee export view
CREATE OR REPLACE VIEW enhanced_attendee_export AS
SELECT 
    er.id as registration_id,
    er.event_id,
    er.user_address,
    er.registration_status,
    er.registered_at,
    er.checked_in_at,
    er.completed_at,
    er.check_in_method,
    
    -- User profile data
    up.first_name,
    up.last_name,
    up.email,
    up.phone,
    up.profile_picture,
    up.bio,
    up.occupation,
    up.linkedin,
    up.twitter,
    up.discord,
    up.github,
    
    -- Event data
    e.title as event_title,
    e.event_date,
    e.location as event_location,
    e.required_tokens,
    
    -- QR audit data
    (
        SELECT COUNT(*) 
        FROM qr_code_audit qra 
        WHERE qra.registration_id = er.id 
        AND qra.validation_result = 'success'
    ) as qr_scan_count,
    
    -- Latest check-in method
    (
        SELECT qra.scanner_address 
        FROM qr_code_audit qra 
        WHERE qra.registration_id = er.id 
        AND qra.action_taken = 'check_in'
        ORDER BY qra.created_at DESC 
        LIMIT 1
    ) as checked_in_by

FROM event_registrations er
LEFT JOIN user_profiles up ON er.user_address = up.wallet_address
LEFT JOIN events e ON er.event_id = e.id
ORDER BY er.registered_at DESC;

-- Create function to validate QR code signatures
CREATE OR REPLACE FUNCTION validate_qr_signature(
    p_event_id UUID,
    p_wallet_address TEXT,
    p_timestamp BIGINT,
    p_signature TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    expected_signature TEXT;
    event_key TEXT;
BEGIN
    -- Get the event's signature key
    SELECT qr_signature_key INTO event_key
    FROM events 
    WHERE id = p_event_id;
    
    IF event_key IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Simple signature validation (in production, use proper cryptographic validation)
    expected_signature := encode(
        digest(
            concat(p_event_id::text, '-', p_wallet_address, '-', p_timestamp::text, '-', event_key),
            'sha256'
        ), 
        'base64'
    );
    
    RETURN substr(expected_signature, 1, 16) = p_signature;
END;
$$ LANGUAGE plpgsql;

-- Create function to process QR check-in with audit trail
CREATE OR REPLACE FUNCTION process_qr_checkin(
    p_event_id UUID,
    p_registration_id UUID,
    p_qr_data_hash TEXT,
    p_qr_signature TEXT,
    p_scanner_address TEXT,
    p_scanner_device_info JSONB DEFAULT '{}',
    p_validation_details JSONB DEFAULT '{}'
) RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    registration_data JSONB
) AS $$
DECLARE
    v_registration event_registrations%ROWTYPE;
    v_validation_result TEXT;
    v_can_checkin BOOLEAN := FALSE;
BEGIN
    -- Get registration details
    SELECT * INTO v_registration
    FROM event_registrations
    WHERE id = p_registration_id;
    
    IF NOT FOUND THEN
        -- Log failed attempt
        INSERT INTO qr_code_audit (
            event_id, registration_id, qr_data_hash, qr_signature,
            scanner_address, scanner_device_info,
            validation_result, validation_details, action_taken
        ) VALUES (
            p_event_id, p_registration_id, p_qr_data_hash, p_qr_signature,
            p_scanner_address, p_scanner_device_info,
            'invalid_registration', p_validation_details, 'rejected'
        );
        
        RETURN QUERY SELECT FALSE, 'Registration not found', '{}'::JSONB;
        RETURN;
    END IF;
    
    -- Validate registration status
    IF v_registration.registration_status != 'registered' THEN
        v_validation_result := 'already_processed';
        v_can_checkin := FALSE;
    ELSE
        v_validation_result := 'success';
        v_can_checkin := TRUE;
    END IF;
    
    -- Log the attempt
    INSERT INTO qr_code_audit (
        event_id, registration_id, qr_data_hash, qr_signature,
        scanner_address, scanner_device_info,
        validation_result, validation_details, 
        action_taken, action_by
    ) VALUES (
        p_event_id, p_registration_id, p_qr_data_hash, p_qr_signature,
        p_scanner_address, p_scanner_device_info,
        v_validation_result, p_validation_details,
        CASE WHEN v_can_checkin THEN 'check_in' ELSE 'rejected' END,
        p_scanner_address
    );
    
    -- Perform check-in if valid
    IF v_can_checkin THEN
        UPDATE event_registrations
        SET 
            registration_status = 'checked_in',
            checked_in_at = NOW(),
            check_in_method = 'qr_scan',
            qr_used_at = NOW()
        WHERE id = p_registration_id;
        
        -- Return success with updated registration data
        RETURN QUERY 
        SELECT TRUE, 'Check-in successful', 
               row_to_json(ROW(v_registration.user_address, NOW()::text))::JSONB;
    ELSE
        RETURN QUERY 
        SELECT FALSE, 
               CASE v_validation_result
                   WHEN 'already_processed' THEN 'User already checked in or registration cancelled'
                   ELSE 'Check-in validation failed'
               END,
               '{}'::JSONB;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_qr_audit_event_id ON qr_code_audit(event_id);
CREATE INDEX IF NOT EXISTS idx_qr_audit_registration_id ON qr_code_audit(registration_id);
CREATE INDEX IF NOT EXISTS idx_qr_audit_scan_timestamp ON qr_code_audit(scan_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_qr_audit_validation_result ON qr_code_audit(validation_result);
CREATE INDEX IF NOT EXISTS idx_qr_audit_scanner_address ON qr_code_audit(scanner_address);

CREATE INDEX IF NOT EXISTS idx_registrations_qr_generated ON event_registrations(qr_generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_registrations_check_in_method ON event_registrations(check_in_method);

-- Create RLS policies for QR audit table
ALTER TABLE qr_code_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Event creators can read QR audit for their events" ON qr_code_audit
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM events 
            WHERE events.id = qr_code_audit.event_id 
            AND events.creator_address = current_setting('request.jwt.claims', true)::json->>'wallet_address'
        )
    );

CREATE POLICY "System can insert QR audit records" ON qr_code_audit
    FOR INSERT WITH CHECK (true);

-- Create function to generate enhanced attendee export
CREATE OR REPLACE FUNCTION get_enhanced_attendee_export(p_event_id UUID)
RETURNS TABLE (
    registration_id UUID,
    wallet_address TEXT,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    registration_status TEXT,
    registered_at TIMESTAMP WITH TIME ZONE,
    checked_in_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    check_in_method TEXT,
    qr_scan_count BIGINT,
    has_required_tokens BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        eae.registration_id,
        eae.user_address,
        eae.first_name,
        eae.last_name,
        eae.email,
        eae.phone,
        eae.registration_status,
        eae.registered_at,
        eae.checked_in_at,
        eae.completed_at,
        eae.check_in_method,
        eae.qr_scan_count,
        -- This would need to be implemented based on your token validation logic
        TRUE as has_required_tokens
    FROM enhanced_attendee_export eae
    WHERE eae.event_id = p_event_id
    ORDER BY eae.registered_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE qr_code_audit IS 'Audit trail for QR code scans and check-in attempts';
COMMENT ON COLUMN qr_code_audit.qr_data_hash IS 'Hash of the QR code data for tracking without storing sensitive info';
COMMENT ON COLUMN qr_code_audit.validation_result IS 'Result of QR code validation attempt';
COMMENT ON COLUMN qr_code_audit.scanner_device_info IS 'Information about the device used to scan the QR code';

COMMENT ON VIEW enhanced_attendee_export IS 'Comprehensive view of attendee data for export functionality';

COMMENT ON FUNCTION validate_qr_signature IS 'Validates QR code signatures for security';
COMMENT ON FUNCTION process_qr_checkin IS 'Processes QR code check-in with full audit trail';
COMMENT ON FUNCTION get_enhanced_attendee_export IS 'Returns enhanced attendee data for export';

-- Update the events table comment
COMMENT ON COLUMN events.enhanced_qr_enabled IS 'Whether enhanced QR features are enabled for this event';
COMMENT ON COLUMN events.qr_signature_key IS 'Key used for QR code signature validation';
COMMENT ON COLUMN events.qr_expiry_hours IS 'Hours after which QR codes expire';