// scripts/verify-knowledge-permissions.mjs
// Verifies that knowledge base permissions are properly set up

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyPermissions() {
  console.log('🔍 Verifying Knowledge Base permissions setup...\n');

  try {
    // Check if we can query pod_role_permissions table
    const { data: roles, error } = await supabase
      .from('pod_role_permissions')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Error querying pod_role_permissions:', error);
      console.log('\n⚠️  Cannot verify permissions. Please check table access.');
      return;
    }

    if (!roles || roles.length === 0) {
      console.log('ℹ️  No pod role permissions found yet. Permissions will be added when roles are created.');
      return;
    }

    const sampleRole = roles[0];
    const columns = Object.keys(sampleRole);

    console.log('📊 Sample pod_role columns:', columns.join(', '));
    console.log('\n🔍 Checking for knowledge base permission columns...\n');

    const requiredColumns = [
      'knowledge_base_access',
      'knowledge_base_manage',
    ];

    let allFound = true;
    for (const col of requiredColumns) {
      if (columns.includes(col)) {
        console.log(`✅ ${col} - Found`);
      } else {
        console.log(`❌ ${col} - Missing`);
        allFound = false;
      }
    }

    if (!allFound) {
      console.log('\n⚠️  Missing columns detected!\n');
      console.log('📝 Please run the following SQL in your Supabase SQL Editor:\n');
      console.log('---START SQL---');
      console.log(`
-- Add knowledge base permission columns to pod_role_permissions table
ALTER TABLE pod_role_permissions
ADD COLUMN IF NOT EXISTS knowledge_base_access BOOLEAN DEFAULT false;

ALTER TABLE pod_role_permissions
ADD COLUMN IF NOT EXISTS knowledge_base_manage BOOLEAN DEFAULT false;

-- Update existing roles to have permissions disabled by default
UPDATE pod_role_permissions
SET knowledge_base_access = false,
    knowledge_base_manage = false
WHERE knowledge_base_access IS NULL
   OR knowledge_base_manage IS NULL;

-- Add comments
COMMENT ON COLUMN pod_role_permissions.knowledge_base_access IS 'Can view knowledge base content';
COMMENT ON COLUMN pod_role_permissions.knowledge_base_manage IS 'Can create/edit knowledge base categories and content';
      `);
      console.log('---END SQL---\n');
    } else {
      console.log('\n✅ All knowledge base permission columns are present!');

      // Show sample data
      console.log('\n📋 Sample role permissions:');
      console.log('  knowledge_base_access:', sampleRole.knowledge_base_access);
      console.log('  knowledge_base_manage:', sampleRole.knowledge_base_manage);
    }

    console.log('\n✅ Verification complete!');
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

verifyPermissions();
