-- RLS policies for the Password Vault tables.
--
-- Permission resolution model (matches the rest of the app):
--   1. `active_pod_members` links a wallet to a pod via a hat_id.
--   2. `pod_role_permissions` is keyed by (pod_id, token_address = hat_id)
--      and holds a `permissions` JSONB with feature flags.
--   3. To check "wallet W has permission X in pod P": join the two on
--      pod_id + hat_id/token_address and read permissions->>'X'.
--
-- Permission semantics:
--   passwordsAccess = can read entries (be a recipient)
--   passwordsManage = can create / update / delete entries, grant access
--
-- Note: the server-side admin client (SUPABASE_SERVICE_ROLE_KEY)
-- bypasses all RLS. The vault API routes use the standard authenticated
-- client where applicable, so these policies are the real access gate.

-- ── enable RLS ─────────────────────────────────────────────────────────
ALTER TABLE vault_user_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_wrapped_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_pending_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_rotation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_access_log ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- VAULT_USER_KEYS — anyone can read pubkeys (needed to wrap to them);
-- users can only insert/update their own row.
-- ============================================================================

CREATE POLICY "Authenticated users can read any vault user key"
ON vault_user_keys
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can publish their own vault user key"
ON vault_user_keys
FOR INSERT
TO authenticated
WITH CHECK (
  LOWER(auth.jwt() ->> 'wallet_address') = eoa_address
);

CREATE POLICY "Users can update their own vault user key"
ON vault_user_keys
FOR UPDATE
TO authenticated
USING (
  LOWER(auth.jwt() ->> 'wallet_address') = eoa_address
)
WITH CHECK (
  LOWER(auth.jwt() ->> 'wallet_address') = eoa_address
);

-- ============================================================================
-- VAULT_ENTRIES — readable by anyone with a wrapped key for the entry
-- OR by anyone with passwordsManage in the pod; writable only by managers.
-- ============================================================================

CREATE POLICY "Members with a wrapped key or passwordsManage can read entries"
ON vault_entries
FOR SELECT
TO authenticated
USING (
  -- The caller has a wrap (real cryptographic gate).
  EXISTS (
    SELECT 1
    FROM vault_wrapped_keys vwk
    WHERE vwk.entry_id = vault_entries.id
      AND vwk.recipient_eoa = LOWER(auth.jwt() ->> 'wallet_address')
  )
  OR
  -- Managers can always list, even if not yet wrapped to.
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    JOIN pod_role_permissions prp
      ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
    WHERE apm.pod_id = vault_entries.pod_id
      AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
      AND apm.is_active = true
      AND (prp.permissions->>'passwordsManage')::boolean = true
  )
  OR
  -- Defense in depth: caller holds a role listed in allowed_role_ids
  -- (or it's empty, meaning "any reader with passwordsAccess").
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    JOIN pod_role_permissions prp
      ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
    WHERE apm.pod_id = vault_entries.pod_id
      AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
      AND apm.is_active = true
      AND (prp.permissions->>'passwordsAccess')::boolean = true
      AND (
        cardinality(vault_entries.allowed_role_ids) = 0
        OR prp.id = ANY (vault_entries.allowed_role_ids)
      )
  )
);

CREATE POLICY "Managers can create vault entries"
ON vault_entries
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    JOIN pod_role_permissions prp
      ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
    WHERE apm.pod_id = vault_entries.pod_id
      AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
      AND apm.is_active = true
      AND (prp.permissions->>'passwordsManage')::boolean = true
  )
);

CREATE POLICY "Managers can update vault entries"
ON vault_entries
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    JOIN pod_role_permissions prp
      ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
    WHERE apm.pod_id = vault_entries.pod_id
      AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
      AND apm.is_active = true
      AND (prp.permissions->>'passwordsManage')::boolean = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    JOIN pod_role_permissions prp
      ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
    WHERE apm.pod_id = vault_entries.pod_id
      AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
      AND apm.is_active = true
      AND (prp.permissions->>'passwordsManage')::boolean = true
  )
);

CREATE POLICY "Managers can delete vault entries"
ON vault_entries
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    JOIN pod_role_permissions prp
      ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
    WHERE apm.pod_id = vault_entries.pod_id
      AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
      AND apm.is_active = true
      AND (prp.permissions->>'passwordsManage')::boolean = true
  )
);

-- ============================================================================
-- VAULT_WRAPPED_KEYS — readable by the recipient or pod manager;
-- writable only by managers (managers wrap new keys for newcomers).
-- ============================================================================

CREATE POLICY "Recipients and managers can read wrapped keys"
ON vault_wrapped_keys
FOR SELECT
TO authenticated
USING (
  recipient_eoa = LOWER(auth.jwt() ->> 'wallet_address')
  OR
  EXISTS (
    SELECT 1
    FROM vault_entries ve
    JOIN active_pod_members apm ON apm.pod_id = ve.pod_id
    JOIN pod_role_permissions prp
      ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
    WHERE ve.id = vault_wrapped_keys.entry_id
      AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
      AND apm.is_active = true
      AND (prp.permissions->>'passwordsManage')::boolean = true
  )
);

CREATE POLICY "Managers can insert wrapped keys"
ON vault_wrapped_keys
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM vault_entries ve
    JOIN active_pod_members apm ON apm.pod_id = ve.pod_id
    JOIN pod_role_permissions prp
      ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
    WHERE ve.id = vault_wrapped_keys.entry_id
      AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
      AND apm.is_active = true
      AND (prp.permissions->>'passwordsManage')::boolean = true
  )
);

CREATE POLICY "Managers can delete wrapped keys"
ON vault_wrapped_keys
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM vault_entries ve
    JOIN active_pod_members apm ON apm.pod_id = ve.pod_id
    JOIN pod_role_permissions prp
      ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
    WHERE ve.id = vault_wrapped_keys.entry_id
      AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
      AND apm.is_active = true
      AND (prp.permissions->>'passwordsManage')::boolean = true
  )
);

-- ============================================================================
-- VAULT_PENDING_GRANTS — managers can read/manage; the newcomer themselves
-- can also see which grants are pending for them.
-- ============================================================================

CREATE POLICY "Managers and pending newcomers can read pending grants"
ON vault_pending_grants
FOR SELECT
TO authenticated
USING (
  newcomer_eoa = LOWER(auth.jwt() ->> 'wallet_address')
  OR
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    JOIN pod_role_permissions prp
      ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
    WHERE apm.pod_id = vault_pending_grants.pod_id
      AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
      AND apm.is_active = true
      AND (prp.permissions->>'passwordsManage')::boolean = true
  )
);

CREATE POLICY "Managers can create pending grants"
ON vault_pending_grants
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    JOIN pod_role_permissions prp
      ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
    WHERE apm.pod_id = vault_pending_grants.pod_id
      AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
      AND apm.is_active = true
      AND (prp.permissions->>'passwordsManage')::boolean = true
  )
);

CREATE POLICY "Managers can delete pending grants"
ON vault_pending_grants
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    JOIN pod_role_permissions prp
      ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
    WHERE apm.pod_id = vault_pending_grants.pod_id
      AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
      AND apm.is_active = true
      AND (prp.permissions->>'passwordsManage')::boolean = true
  )
);

-- ============================================================================
-- VAULT_ROTATION_JOBS — any active reader in the pod can see/update them
-- (the next online reader runs the rotation in their browser).
-- ============================================================================

CREATE POLICY "Pod readers can read rotation jobs"
ON vault_rotation_jobs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    JOIN pod_role_permissions prp
      ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
    WHERE apm.pod_id = vault_rotation_jobs.pod_id
      AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
      AND apm.is_active = true
      AND (prp.permissions->>'passwordsAccess')::boolean = true
  )
);

CREATE POLICY "Pod readers can update rotation jobs"
ON vault_rotation_jobs
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    JOIN pod_role_permissions prp
      ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
    WHERE apm.pod_id = vault_rotation_jobs.pod_id
      AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
      AND apm.is_active = true
      AND (prp.permissions->>'passwordsAccess')::boolean = true
  )
);

CREATE POLICY "Managers can insert rotation jobs"
ON vault_rotation_jobs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM active_pod_members apm
    JOIN pod_role_permissions prp
      ON prp.pod_id = apm.pod_id AND prp.token_address = apm.hat_id
    WHERE apm.pod_id = vault_rotation_jobs.pod_id
      AND apm.wallet = LOWER(auth.jwt() ->> 'wallet_address')
      AND apm.is_active = true
      AND (prp.permissions->>'passwordsManage')::boolean = true
  )
);

-- ============================================================================
-- VAULT_ACCESS_LOG — service-role inserts only, no client SELECT.
-- ============================================================================

COMMENT ON TABLE vault_access_log IS
  'Server-side audit log. No client policies — only admin client can write/read. Query via SQL editor for incident response.';
