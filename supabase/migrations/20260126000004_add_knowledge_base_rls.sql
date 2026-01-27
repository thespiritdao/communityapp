-- Enable RLS on knowledge base tables
ALTER TABLE knowledge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_item_views ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- KNOWLEDGE CATEGORIES RLS POLICIES
-- ============================================================================

-- Allow everyone to read public global categories
CREATE POLICY "Public can view global public categories"
ON knowledge_categories
FOR SELECT
USING (
  pod_id IS NULL
  AND is_public = true
);

-- Allow authenticated users to read categories for pods they have access to
CREATE POLICY "Members can view pod categories with access permission"
ON knowledge_categories
FOR SELECT
USING (
  pod_id IS NOT NULL
  AND (
    -- Check if user has knowledgeBaseAccess permission for this pod
    EXISTS (
      SELECT 1
      FROM pod_role_assignments pra
      JOIN pod_role_permissions prp ON pra.role_id = prp.id
      WHERE pra.pod_id = knowledge_categories.pod_id
        AND pra.wallet_address = LOWER(auth.jwt() ->> 'wallet_address')
        AND pra.is_active = true
        AND (prp.permissions->>'knowledgeBaseAccess')::boolean = true
    )
    OR
    -- Or if the category is public
    is_public = true
  )
);

-- Allow pod managers to create categories
CREATE POLICY "Managers can create pod categories"
ON knowledge_categories
FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'wallet_address' IS NOT NULL
  AND (
    -- Must have knowledgeBaseManage permission
    EXISTS (
      SELECT 1
      FROM pod_role_assignments pra
      JOIN pod_role_permissions prp ON pra.role_id = prp.id
      WHERE pra.pod_id = knowledge_categories.pod_id
        AND pra.wallet_address = LOWER(auth.jwt() ->> 'wallet_address')
        AND pra.is_active = true
        AND (prp.permissions->>'knowledgeBaseManage')::boolean = true
    )
  )
);

-- Allow pod managers to update categories
CREATE POLICY "Managers can update pod categories"
ON knowledge_categories
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM pod_role_assignments pra
    JOIN pod_role_permissions prp ON pra.role_id = prp.id
    WHERE pra.pod_id = knowledge_categories.pod_id
      AND pra.wallet_address = LOWER(auth.jwt() ->> 'wallet_address')
      AND pra.is_active = true
      AND (prp.permissions->>'knowledgeBaseManage')::boolean = true
  )
);

-- Allow pod managers to delete categories
CREATE POLICY "Managers can delete pod categories"
ON knowledge_categories
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM pod_role_assignments pra
    JOIN pod_role_permissions prp ON pra.role_id = prp.id
    WHERE pra.pod_id = knowledge_categories.pod_id
      AND pra.wallet_address = LOWER(auth.jwt() ->> 'wallet_address')
      AND pra.is_active = true
      AND (prp.permissions->>'knowledgeBaseManage')::boolean = true
  )
);

-- ============================================================================
-- KNOWLEDGE ITEMS RLS POLICIES
-- ============================================================================

-- Allow everyone to read public global items
CREATE POLICY "Public can view global public items"
ON knowledge_items
FOR SELECT
USING (
  pod_id IS NULL
  AND is_public = true
);

-- Allow authenticated users to read items for pods they have access to
CREATE POLICY "Members can view pod items with access permission"
ON knowledge_items
FOR SELECT
USING (
  pod_id IS NOT NULL
  AND (
    -- Check if user has knowledgeBaseAccess permission for this pod
    EXISTS (
      SELECT 1
      FROM pod_role_assignments pra
      JOIN pod_role_permissions prp ON pra.role_id = prp.id
      WHERE pra.pod_id = knowledge_items.pod_id
        AND pra.wallet_address = LOWER(auth.jwt() ->> 'wallet_address')
        AND pra.is_active = true
        AND (prp.permissions->>'knowledgeBaseAccess')::boolean = true
    )
    OR
    -- Or if the item is public
    is_public = true
  )
);

-- Allow pod managers to create items
CREATE POLICY "Managers can create pod items"
ON knowledge_items
FOR INSERT
WITH CHECK (
  auth.jwt() ->> 'wallet_address' IS NOT NULL
  AND (
    -- Must have knowledgeBaseManage permission
    EXISTS (
      SELECT 1
      FROM pod_role_assignments pra
      JOIN pod_role_permissions prp ON pra.role_id = prp.id
      WHERE pra.pod_id = knowledge_items.pod_id
        AND pra.wallet_address = LOWER(auth.jwt() ->> 'wallet_address')
        AND pra.is_active = true
        AND (prp.permissions->>'knowledgeBaseManage')::boolean = true
    )
  )
);

-- Allow pod managers to update items
CREATE POLICY "Managers can update pod items"
ON knowledge_items
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM pod_role_assignments pra
    JOIN pod_role_permissions prp ON pra.role_id = prp.id
    WHERE pra.pod_id = knowledge_items.pod_id
      AND pra.wallet_address = LOWER(auth.jwt() ->> 'wallet_address')
      AND pra.is_active = true
      AND (prp.permissions->>'knowledgeBaseManage')::boolean = true
  )
);

-- Allow pod managers to delete items
CREATE POLICY "Managers can delete pod items"
ON knowledge_items
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM pod_role_assignments pra
    JOIN pod_role_permissions prp ON pra.role_id = prp.id
    WHERE pra.pod_id = knowledge_items.pod_id
      AND pra.wallet_address = LOWER(auth.jwt() ->> 'wallet_address')
      AND pra.is_active = true
      AND (prp.permissions->>'knowledgeBaseManage')::boolean = true
  )
);

-- ============================================================================
-- KNOWLEDGE ITEM VIEWS RLS POLICIES
-- ============================================================================

-- Allow anyone to increment view counts (via RPC function)
-- The RPC function is SECURITY DEFINER so it bypasses RLS
CREATE POLICY "Anyone can record views"
ON knowledge_item_views
FOR INSERT
WITH CHECK (true);

-- Allow authenticated users to view their own view history
CREATE POLICY "Users can view their own view history"
ON knowledge_item_views
FOR SELECT
USING (
  viewer_address = LOWER(auth.jwt() ->> 'wallet_address')
  OR viewer_address IS NULL
);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON POLICY "Public can view global public categories" ON knowledge_categories IS
  'Allow anyone to view categories marked as public with no pod association';

COMMENT ON POLICY "Members can view pod categories with access permission" ON knowledge_categories IS
  'Allow pod members with knowledgeBaseAccess permission to view pod categories';

COMMENT ON POLICY "Managers can create pod categories" ON knowledge_categories IS
  'Allow pod members with knowledgeBaseManage permission to create categories';

COMMENT ON POLICY "Public can view global public items" ON knowledge_items IS
  'Allow anyone to view items marked as public with no pod association';

COMMENT ON POLICY "Members can view pod items with access permission" ON knowledge_items IS
  'Allow pod members with knowledgeBaseAccess permission to view pod items';

COMMENT ON POLICY "Managers can create pod items" ON knowledge_items IS
  'Allow pod members with knowledgeBaseManage permission to create items';

COMMENT ON POLICY "Anyone can record views" ON knowledge_item_views IS
  'Allow view tracking for analytics (via SECURITY DEFINER RPC function)';
