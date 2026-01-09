-- Migration: Fix active_pod_members view to include pod details
-- Date: 2026-01-09
-- Description: The view needs to join with pods table to provide pod_name and other pod metadata

DROP VIEW IF EXISTS active_pod_members CASCADE;

CREATE OR REPLACE VIEW active_pod_members AS
SELECT
    pm.pod_id,
    pm.wallet,
    pm.hat_id,
    pm.membership_type,
    pm.source,
    pm.indexed_at,
    pm.joined_at,
    pm.created_at,
    pm.updated_at,
    pm.is_active,
    p.name as pod_name,
    p.management_hat_id,
    p.membership_hat_id,
    p.status as pod_status
FROM pod_members pm
LEFT JOIN pods p ON pm.pod_id = p.id
WHERE pm.is_active = TRUE;

COMMENT ON VIEW active_pod_members IS 'Active pod members with pod details joined from pods table - Updated 2026-01-09';
