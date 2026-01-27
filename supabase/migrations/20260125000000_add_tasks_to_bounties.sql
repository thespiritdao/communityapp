-- Add tasks column to bounties table
-- Tasks are separate from requirements - they represent specific work items to complete

ALTER TABLE bounties
ADD COLUMN IF NOT EXISTS tasks JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN bounties.tasks IS 'List of specific tasks/work items to complete for this bounty';
