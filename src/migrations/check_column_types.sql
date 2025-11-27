-- Check the actual column types to fix casting issues

-- Check pod_members table structure
SELECT 
    column_name, 
    data_type, 
    udt_name,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'pod_members'
ORDER BY ordinal_position;

-- Check what auth.uid() returns
SELECT auth.uid() as uid, pg_typeof(auth.uid()) as uid_type;

-- Check if user_id is text or uuid
SELECT 
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'pod_members' 
AND column_name = 'user_id';