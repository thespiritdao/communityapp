-- Add knowledge_base_enabled column to pod_modules table
ALTER TABLE pod_modules
ADD COLUMN IF NOT EXISTS knowledge_base_enabled BOOLEAN DEFAULT false;

-- Add knowledge_base_config column for future configuration options
ALTER TABLE pod_modules
ADD COLUMN IF NOT EXISTS knowledge_base_config JSONB DEFAULT '{}'::jsonb;

-- Update existing pods to have knowledge base disabled by default
UPDATE pod_modules
SET knowledge_base_enabled = false
WHERE knowledge_base_enabled IS NULL;

-- Add comment
COMMENT ON COLUMN pod_modules.knowledge_base_enabled IS 'Enable knowledge base module for this pod';
COMMENT ON COLUMN pod_modules.knowledge_base_config IS 'Configuration options for knowledge base module';
