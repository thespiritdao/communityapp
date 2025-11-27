-- Check the actual structure of the tokens table

-- Check columns in tokens table
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'tokens'
ORDER BY ordinal_position;

-- Sample some data to see what's in there
SELECT * FROM tokens LIMIT 3;