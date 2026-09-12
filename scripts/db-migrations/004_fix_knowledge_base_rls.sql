-- Fix RLS policies on knowledge_categories, knowledge_items, knowledge_item_views
--
-- ROOT CAUSE: Original policies reference "pod_role_assignments" which does not exist.
--             They also use auth.jwt() ->> 'wallet_address' which is NULL in our JWT.
--
-- FIX: Use the same proven pattern as chat_groups, forum_categories, and pod_modules:
--       (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
--       checked against pods.pod_leads or pods.created_by_address.
--
-- For SELECT on pod content, pod members are checked via pod_members table.
-- For INSERT/UPDATE/DELETE, only pod leaders can manage KB content.

-- ============================================================================
-- KNOWLEDGE CATEGORIES
-- ============================================================================

DROP POLICY IF EXISTS "Public can view global public categories" ON knowledge_categories;
DROP POLICY IF EXISTS "Members can view pod categories with access permission" ON knowledge_categories;
DROP POLICY IF EXISTS "Managers can create pod categories" ON knowledge_categories;
DROP POLICY IF EXISTS "Managers can update pod categories" ON knowledge_categories;
DROP POLICY IF EXISTS "Managers can delete pod categories" ON knowledge_categories;

-- SELECT: public global categories (no auth needed)
CREATE POLICY "Public can view global public categories"
ON knowledge_categories
FOR SELECT
USING (
  pod_id IS NULL
  AND is_public = true
);

-- SELECT: pod categories — visible to pod members and leaders
CREATE POLICY "Members can view pod categories"
ON knowledge_categories
FOR SELECT
TO authenticated
USING (
  pod_id IS NOT NULL
  AND (
    is_public = true
    OR EXISTS (
      SELECT 1 FROM pod_members pm
      WHERE pm.pod_id = knowledge_categories.pod_id
        AND LOWER(pm.wallet) = LOWER(
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
        )
        AND pm.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = knowledge_categories.pod_id
        AND (
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
            = ANY(pods.pod_leads)
          OR pods.created_by_address =
            (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
        )
    )
  )
);

-- INSERT: pod leaders only
CREATE POLICY "Pod leaders can create knowledge categories"
ON knowledge_categories
FOR INSERT
TO authenticated
WITH CHECK (
  pod_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pods
    WHERE pods.id = knowledge_categories.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
          = ANY(pods.pod_leads)
        OR pods.created_by_address =
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
  )
);

-- UPDATE: pod leaders only
CREATE POLICY "Pod leaders can update knowledge categories"
ON knowledge_categories
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM pods
    WHERE pods.id = knowledge_categories.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
          = ANY(pods.pod_leads)
        OR pods.created_by_address =
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
  )
);

-- DELETE: pod leaders only
CREATE POLICY "Pod leaders can delete knowledge categories"
ON knowledge_categories
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM pods
    WHERE pods.id = knowledge_categories.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
          = ANY(pods.pod_leads)
        OR pods.created_by_address =
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
  )
);

-- ============================================================================
-- KNOWLEDGE ITEMS
-- ============================================================================

DROP POLICY IF EXISTS "Public can view global public items" ON knowledge_items;
DROP POLICY IF EXISTS "Members can view pod items with access permission" ON knowledge_items;
DROP POLICY IF EXISTS "Managers can create pod items" ON knowledge_items;
DROP POLICY IF EXISTS "Managers can update pod items" ON knowledge_items;
DROP POLICY IF EXISTS "Managers can delete pod items" ON knowledge_items;

-- SELECT: public global items (no auth needed)
CREATE POLICY "Public can view global public items"
ON knowledge_items
FOR SELECT
USING (
  pod_id IS NULL
  AND is_public = true
);

-- SELECT: pod items — visible to pod members and leaders
CREATE POLICY "Members can view pod items"
ON knowledge_items
FOR SELECT
TO authenticated
USING (
  pod_id IS NOT NULL
  AND (
    is_public = true
    OR EXISTS (
      SELECT 1 FROM pod_members pm
      WHERE pm.pod_id = knowledge_items.pod_id
        AND LOWER(pm.wallet) = LOWER(
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
        )
        AND pm.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = knowledge_items.pod_id
        AND (
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
            = ANY(pods.pod_leads)
          OR pods.created_by_address =
            (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
        )
    )
  )
);

-- INSERT: pod leaders only
CREATE POLICY "Pod leaders can create knowledge items"
ON knowledge_items
FOR INSERT
TO authenticated
WITH CHECK (
  pod_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM pods
    WHERE pods.id = knowledge_items.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
          = ANY(pods.pod_leads)
        OR pods.created_by_address =
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
  )
);

-- UPDATE: pod leaders only
CREATE POLICY "Pod leaders can update knowledge items"
ON knowledge_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM pods
    WHERE pods.id = knowledge_items.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
          = ANY(pods.pod_leads)
        OR pods.created_by_address =
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
  )
);

-- DELETE: pod leaders only
CREATE POLICY "Pod leaders can delete knowledge items"
ON knowledge_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM pods
    WHERE pods.id = knowledge_items.pod_id
      AND (
        (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
          = ANY(pods.pod_leads)
        OR pods.created_by_address =
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
      )
  )
);

-- ============================================================================
-- KNOWLEDGE ITEM VIEWS — fix the SELECT policy
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own view history" ON knowledge_item_views;

CREATE POLICY "Users can view their own view history"
ON knowledge_item_views
FOR SELECT
TO authenticated
USING (
  user_address IS NULL
  OR LOWER(user_address) = LOWER(
    (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
  )
);

-- INSERT policy ("Anyone can record views") uses WITH CHECK (true) — leave it alone.
