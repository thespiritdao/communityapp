-- Update your existing tokens table with HAT IDs
-- Run this in Supabase SQL Editor

-- Update Executive Pod with HAT ID
UPDATE tokens 
SET hat_id = '0x0000008800010000000000000000000000000000000000000000000000000000'
WHERE id = 'exec';

-- Update Dev Pod with HAT ID  
UPDATE tokens
SET hat_id = '0x0000008800020000000000000000000000000000000000000000000000000000'
WHERE id = 'dev';

-- Update Bounty Management with HAT ID
UPDATE tokens
SET hat_id = '0x0000008800010001000100000000000000000000000000000000000000000000'
WHERE id = 'bounty';

-- Update Market Admin with HAT ID
UPDATE tokens
SET hat_id = '0x0000008800010000000000000000000000000000000000000000000000000000'
WHERE id = 'market';

-- Verify the updates
SELECT id, name, hat_id, is_active FROM tokens WHERE hat_id IS NOT NULL;