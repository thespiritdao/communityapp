-- Enable Realtime for Permission and Chat Moderation Tables
-- This allows realtime subscriptions to detect permission and mute/unmute changes

-- Enable realtime for pod_role_permissions table (skip if already exists)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE pod_role_permissions;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'pod_role_permissions already in publication, skipping';
END $$;

-- Enable realtime for chat_muted_users table (skip if already exists)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_muted_users;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'chat_muted_users already in publication, skipping';
END $$;

-- Verify realtime is enabled for both tables
SELECT
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables
WHERE tablename IN ('pod_role_permissions', 'chat_muted_users')
ORDER BY tablename;

-- If the above query returns 2 rows, realtime is enabled successfully for both tables!
