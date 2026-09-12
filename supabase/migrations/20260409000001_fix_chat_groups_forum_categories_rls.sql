-- Fix RLS INSERT policies for chat_groups and forum_categories
-- Both tables are blocking pod leader inserts from the manage UI.
-- Root cause: the INSERT policies were never applied to the live DB.

-- ============================================================
-- CHAT GROUPS
-- ============================================================

-- Drop any existing INSERT/UPDATE/DELETE policies that may be stale or wrong
DROP POLICY IF EXISTS "Pod managers can create chat groups" ON chat_groups;
DROP POLICY IF EXISTS "Pod managers can update their chat groups" ON chat_groups;
DROP POLICY IF EXISTS "Pod managers can delete their chat groups" ON chat_groups;
DROP POLICY IF EXISTS "Users can view active chat groups" ON chat_groups;
DROP POLICY IF EXISTS "Pod leaders can insert chat groups" ON chat_groups;
DROP POLICY IF EXISTS "Pod leaders can update chat groups" ON chat_groups;
DROP POLICY IF EXISTS "Pod leaders can delete chat groups" ON chat_groups;

-- Ensure RLS is on
ALTER TABLE chat_groups ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users can see active channels
CREATE POLICY "Users can view active chat groups"
  ON chat_groups FOR SELECT
  TO authenticated
  USING (is_active = true);

-- INSERT: pod leads and pod creators only
CREATE POLICY "Pod leaders can insert chat groups"
  ON chat_groups FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = chat_groups.pod_id
        AND (
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
            = ANY(pods.pod_leads)
          OR
          pods.created_by_address =
            (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
        )
    )
  );

-- UPDATE: same check
CREATE POLICY "Pod leaders can update chat groups"
  ON chat_groups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = chat_groups.pod_id
        AND (
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
            = ANY(pods.pod_leads)
          OR
          pods.created_by_address =
            (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
        )
    )
  );

-- DELETE: same check
CREATE POLICY "Pod leaders can delete chat groups"
  ON chat_groups FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = chat_groups.pod_id
        AND (
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
            = ANY(pods.pod_leads)
          OR
          pods.created_by_address =
            (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
        )
    )
  );

-- ============================================================
-- FORUM CATEGORIES
-- ============================================================

DROP POLICY IF EXISTS "Pod managers can create forum categories" ON forum_categories;
DROP POLICY IF EXISTS "Pod managers can update forum categories" ON forum_categories;
DROP POLICY IF EXISTS "Pod managers can delete forum categories" ON forum_categories;
DROP POLICY IF EXISTS "Anyone can view categories" ON forum_categories;
DROP POLICY IF EXISTS "Moderators can create categories" ON forum_categories;
DROP POLICY IF EXISTS "Moderators can update categories" ON forum_categories;
DROP POLICY IF EXISTS "Moderators can delete categories" ON forum_categories;
DROP POLICY IF EXISTS "Pod leaders can insert forum categories" ON forum_categories;
DROP POLICY IF EXISTS "Pod leaders can update forum categories" ON forum_categories;
DROP POLICY IF EXISTS "Pod leaders can delete forum categories" ON forum_categories;

ALTER TABLE forum_categories ENABLE ROW LEVEL SECURITY;

-- SELECT: everyone can read categories
CREATE POLICY "Anyone can view forum categories"
  ON forum_categories FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: pod leads and pod creators only (pod-linked categories)
-- Global categories (pod_id IS NULL) are blocked from client-side insert intentionally
CREATE POLICY "Pod leaders can insert forum categories"
  ON forum_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    pod_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = forum_categories.pod_id
        AND (
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
            = ANY(pods.pod_leads)
          OR
          pods.created_by_address =
            (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
        )
    )
  );

-- UPDATE: same check
CREATE POLICY "Pod leaders can update forum categories"
  ON forum_categories FOR UPDATE
  TO authenticated
  USING (
    pod_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = forum_categories.pod_id
        AND (
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
            = ANY(pods.pod_leads)
          OR
          pods.created_by_address =
            (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
        )
    )
  );

-- DELETE: same check
CREATE POLICY "Pod leaders can delete forum categories"
  ON forum_categories FOR DELETE
  TO authenticated
  USING (
    pod_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM pods
      WHERE pods.id = forum_categories.pod_id
        AND (
          (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
            = ANY(pods.pod_leads)
          OR
          pods.created_by_address =
            (SELECT wallet_address FROM user_profiles WHERE user_id = auth.uid())
        )
    )
  );
