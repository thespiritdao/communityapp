-- Grant permissions for pod_permission_lookup VIEW
-- Views don't have RLS, but we need to ensure proper access

-- Grant SELECT permissions on the pod_permission_lookup view
GRANT SELECT ON pod_permission_lookup TO anon;
GRANT SELECT ON pod_permission_lookup TO authenticated;
GRANT SELECT ON pod_permission_lookup TO service_role;

-- If you want to see the view definition (to understand the underlying tables):
-- Run this query to see what tables the view is based on:
/*
SELECT definition 
FROM pg_views 
WHERE viewname = 'pod_permission_lookup';
*/

-- Alternative: If the underlying tables don't exist or have different names,
-- you might need to check your actual database schema.
-- You can list all tables and views with:
/*
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%pod%' OR table_name LIKE '%permission%'
ORDER BY table_name;
*/