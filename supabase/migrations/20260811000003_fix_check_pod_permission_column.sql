-- Fix: check_pod_permission() referenced prp.hat_id, but the live
-- pod_role_permissions table stores the hat id in `token_address`. The
-- function has therefore errored (42703) on EVERY granular permission check
-- since deployment — visible as "Failed to check user permission: column
-- prp.hat_id does not exist" in server logs. PodAccessControlService treats
-- the error as not-allowed, so leaders still passed via the leadership
-- fallback, but DELEGATED role permissions (surveyManage, passwordsManage,
-- appearanceManage, …) never actually granted API access to non-leaders.
--
-- Found 2026-08-11 during Pod Faces end-to-end testing (docs/spec-pod-faces.md).
-- Pre-existing bug, not introduced by Pod Faces — but Pod Faces' RLS helper
-- has_pod_permission_current_user() (20260811000001) calls this function, so
-- both are broken until this is applied.
--
-- BEHAVIORAL CHANGE when applied: members holding a role whose permissions
-- JSONB grants a capability will START passing requirePodPermission /
-- requirePodPermissionOrLeader server-side, as originally designed. Review
-- existing role grants before applying if that delegation was unintended.

CREATE OR REPLACE FUNCTION check_pod_permission(
  p_user_wallet TEXT,
  p_pod_id UUID,
  p_permission_key TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  has_permission BOOLEAN := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pod_members pm
    JOIN pod_role_permissions prp
      ON pm.hat_id = prp.token_address
     AND pm.pod_id::uuid = prp.pod_id
    WHERE lower(pm.wallet) = lower(p_user_wallet)
      AND pm.pod_id::uuid = p_pod_id
      AND pm.is_active = true
      AND prp.is_active = true
      AND prp.permissions ->> p_permission_key = 'true'
  ) INTO has_permission;

  RETURN has_permission;
END;
$$ LANGUAGE plpgsql;
