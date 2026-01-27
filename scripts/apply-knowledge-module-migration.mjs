// scripts/apply-knowledge-module-migration.mjs
// Adds knowledge_base_enabled column to pod_modules table

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('📦 Adding knowledge base module to pod_modules table...\n');

  try {
    // We'll execute this via the SQL editor manually since we don't have direct SQL execution
    console.log('📝 Please run the following SQL in your Supabase SQL Editor:\n');
    console.log('---START SQL---');
    console.log(`
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
    `);
    console.log('---END SQL---\n');

    // Verify the table structure
    console.log('📊 Checking current pod_modules columns...');
    const { data: pods, error } = await supabase
      .from('pod_modules')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Error querying pod_modules:', error);
    } else if (pods && pods.length > 0) {
      const columns = Object.keys(pods[0]);
      console.log('✅ Current columns:', columns.join(', '));

      if (columns.includes('knowledge_base_enabled')) {
        console.log('✅ knowledge_base_enabled column already exists!');
      } else {
        console.log('⚠️  knowledge_base_enabled column not found. Please run the SQL above.');
      }
    }

    console.log('\n✅ Migration check complete!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMigration();
