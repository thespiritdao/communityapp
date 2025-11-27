-- Update governance notifications schema to support pod approval workflow
-- This extends the existing governance_notifications_schema.sql

-- Add new notification types for pod approval workflow
ALTER TABLE governance_notifications 
DROP CONSTRAINT IF EXISTS governance_notifications_notification_type_check;

ALTER TABLE governance_notifications 
ADD CONSTRAINT governance_notifications_notification_type_check 
CHECK (notification_type IN (
    'proposal_mentioned',
    'proposal_created',
    'proposal_voted', 
    'proposal_executed',
    'proposal_cancelled',
    'token_holder_notification',
    'pod_approval_request',      -- NEW: Pod needs executive approval
    'pod_approved',              -- NEW: Pod was approved
    'pod_rejected'               -- NEW: Pod was rejected
));

-- Update pods table to include governance status
ALTER TABLE pods ADD COLUMN IF NOT EXISTS governance_proposal_id VARCHAR(255);
ALTER TABLE pods ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'pending' 
    CHECK (approval_status IN ('pending', 'approved', 'rejected'));

-- Index for pod approval status queries
CREATE INDEX IF NOT EXISTS idx_pods_approval_status ON pods(approval_status);
CREATE INDEX IF NOT EXISTS idx_pods_governance_proposal_id ON pods(governance_proposal_id);

-- Function to get executive token holders (real-time balance checking)
CREATE OR REPLACE FUNCTION get_executive_token_holders()
RETURNS TABLE(holder_address VARCHAR) AS $$
BEGIN
    -- This function would normally integrate with the fetchTokenBalances.ts service
    -- For now, return addresses that have participated in governance recently
    RETURN QUERY
    SELECT DISTINCT recipient_address as holder_address
    FROM governance_notifications 
    WHERE notification_type IN ('proposal_voted', 'proposal_created')
    AND created_at >= NOW() - INTERVAL '90 days'
    AND recipient_address IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to notify all executive pod holders about new pod approval requests
CREATE OR REPLACE FUNCTION notify_executive_pod_approval(
    pod_id VARCHAR,
    pod_name VARCHAR,
    pod_description TEXT,
    created_by VARCHAR,
    parent_pod_name VARCHAR
)
RETURNS INTEGER AS $$
DECLARE
    notification_count INTEGER := 0;
    executive_holder RECORD;
BEGIN
    -- Insert notifications for all executive token holders
    FOR executive_holder IN SELECT holder_address FROM get_executive_token_holders()
    LOOP
        INSERT INTO governance_notifications (
            recipient_address,
            sender_address,
            notification_type,
            title,
            message,
            context_url,
            context_type,
            context_id,
            proposal_id,
            is_read
        ) VALUES (
            executive_holder.holder_address,
            created_by,
            'pod_approval_request',
            'New Pod Approval Required: ' || pod_name,
            'A new pod "' || pod_name || '" has been created and requires executive approval.\n\n' ||
            'Description: ' || pod_description || '\n' ||
            'Parent Pod: ' || parent_pod_name || '\n' ||
            'Created by: ' || created_by || '\n\n' ||
            'Please review and vote on this proposal in the governance section.',
            '/pods/' || pod_id,
            'pod_governance',
            pod_id,
            pod_id,
            FALSE
        );
        
        notification_count := notification_count + 1;
    END LOOP;
    
    RETURN notification_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update pod status and notify creator
CREATE OR REPLACE FUNCTION update_pod_approval_status(
    pod_id VARCHAR,
    new_status VARCHAR,
    approver_address VARCHAR DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    pod_record RECORD;
    message_text TEXT;
    title_text VARCHAR;
BEGIN
    -- Get pod information
    SELECT name, created_by_address INTO pod_record 
    FROM pods 
    WHERE id = pod_id;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Update pod status
    UPDATE pods 
    SET 
        approval_status = new_status,
        status = CASE 
            WHEN new_status = 'approved' THEN 'active'
            WHEN new_status = 'rejected' THEN 'rejected'
            ELSE status
        END,
        is_active = CASE WHEN new_status = 'approved' THEN TRUE ELSE FALSE END,
        updated_at = NOW()
    WHERE id = pod_id;
    
    -- Prepare notification content
    IF new_status = 'approved' THEN
        title_text := 'Pod Approved: ' || pod_record.name;
        message_text := 'Congratulations! Your pod "' || pod_record.name || '" has been approved by executive governance and is now active. You can now begin using all pod features including treasury management, event creation, and member management.';
    ELSE
        title_text := 'Pod Rejected: ' || pod_record.name;
        message_text := 'Your pod "' || pod_record.name || '" has been rejected by executive governance. Please review the feedback and consider resubmitting with requested changes.';
    END IF;
    
    -- Notify pod creator
    INSERT INTO governance_notifications (
        recipient_address,
        sender_address,
        notification_type,
        title,
        message,
        context_url,
        context_type,
        context_id,
        proposal_id,
        is_read
    ) VALUES (
        pod_record.created_by_address,
        COALESCE(approver_address, 'system'),
        CASE WHEN new_status = 'approved' THEN 'pod_approved' ELSE 'pod_rejected' END,
        title_text,
        message_text,
        '/pods/' || pod_id,
        'pod_governance',
        pod_id,
        pod_id,
        FALSE
    );
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- View for executive pod holders to see pending approvals
CREATE OR REPLACE VIEW pending_pod_approvals AS
SELECT 
    p.id as pod_id,
    p.name as pod_name,
    p.description,
    p.created_by_address,
    p.pod_leads,
    p.created_at,
    p.pod_image_url,
    pp.name as parent_pod_name,
    gn.id as notification_id,
    gn.created_at as notification_created,
    gn.is_read as notification_read
FROM pods p
LEFT JOIN pods pp ON p.parent_pod_id = pp.id
JOIN governance_notifications gn ON gn.context_id = p.id
WHERE p.approval_status = 'pending'
AND p.status = 'draft'
AND gn.notification_type = 'pod_approval_request'
ORDER BY p.created_at DESC;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_governance_notifications_pod_type 
ON governance_notifications(notification_type, context_type, is_read);

CREATE INDEX IF NOT EXISTS idx_pods_status_approval 
ON pods(status, approval_status, created_at);

-- Grant permissions for the service layer
-- Note: Adjust these permissions based on your actual user roles
-- GRANT SELECT, INSERT, UPDATE ON governance_notifications TO authenticated;
-- GRANT SELECT ON pending_pod_approvals TO authenticated;
-- GRANT EXECUTE ON FUNCTION notify_executive_pod_approval TO authenticated;
-- GRANT EXECUTE ON FUNCTION update_pod_approval_status TO authenticated;

-- Example usage:
/*
-- When a pod is created, notify executives:
SELECT notify_executive_pod_approval('pod-123', 'Marketing Pod', 'Pod for marketing activities', '0xCreator', 'SpiritDAO Root');

-- When executives approve/reject:
SELECT update_pod_approval_status('pod-123', 'approved', '0xExecutive');
SELECT update_pod_approval_status('pod-456', 'rejected', '0xExecutive');

-- View pending approvals for executives:
SELECT * FROM pending_pod_approvals WHERE notification_read = FALSE;
*/