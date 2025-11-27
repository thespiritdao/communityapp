-- Add sentiment column to forum_thread_summaries table
-- This column stores the AI-detected sentiment of the thread discussion

ALTER TABLE forum_thread_summaries
ADD COLUMN IF NOT EXISTS sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative'));

-- Add a default value for existing records
UPDATE forum_thread_summaries
SET sentiment = 'neutral'
WHERE sentiment IS NULL;

-- Add a comment for documentation
COMMENT ON COLUMN forum_thread_summaries.sentiment IS 'AI-detected sentiment of the thread discussion (positive, neutral, or negative)';
