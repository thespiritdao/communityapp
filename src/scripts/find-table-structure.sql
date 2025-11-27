-- Find actual table structure for pod_membership_applications
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'pod_membership_applications'
ORDER BY ordinal_position;

-- Find actual table structure for pod_accountability_signatures  
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'pod_accountability_signatures'
ORDER BY ordinal_position;

-- Find actual table structure for pod_role_permissions
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'pod_role_permissions'
ORDER BY ordinal_position;

-- Check if there are any other tables with 'agreement' in the name
SELECT table_name
FROM information_schema.tables
WHERE table_name ILIKE '%agreement%'
   OR table_name ILIKE '%accountability%'
   OR table_name ILIKE '%signature%';

-- Look for any agreement data in pod_role_permissions eligibility_criteria
SELECT 
  prp.id,
  prp.pod_id,
  prp.role_name,
  prp.eligibility_criteria
FROM pod_role_permissions prp
WHERE prp.eligibility_criteria IS NOT NULL
  AND prp.eligibility_criteria::text ILIKE '%agreement%'
LIMIT 5;

-- Check for existing accountability signatures (if table exists)
SELECT COUNT(*) as signature_count
FROM pod_accountability_signatures;