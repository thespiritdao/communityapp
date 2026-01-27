#!/usr/bin/env node

/**
 * Apply Knowledge Base RLS Migration
 *
 * This script applies Row Level Security policies to the knowledge base tables.
 *
 * WHAT THIS DOES:
 * 1. Enables RLS on knowledge_categories, knowledge_items, knowledge_item_views
 * 2. Adds policies for public global content (no authentication needed)
 * 3. Adds policies for pod-specific content (requires HAT permissions)
 * 4. Restricts write access to users with knowledgeBaseManage permission
 *
 * SECURITY:
 * - Public global content (pod_id = NULL, is_public = true): Readable by anyone
 * - Pod-specific content: Requires knowledgeBaseAccess permission
 * - Creating/editing: Requires knowledgeBaseManage permission
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { Client } = pg;

async function applyMigration() {
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();

    console.log('📖 Reading migration file...');
    const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260126000004_add_knowledge_base_rls.sql');
    const migration = readFileSync(migrationPath, 'utf8');

    console.log('🔒 Applying RLS policies...');
    await client.query(migration);

    console.log('✅ RLS policies applied successfully!');
    console.log('');
    console.log('📊 Summary of changes:');
    console.log('  - Enabled RLS on 3 tables');
    console.log('  - Added 13 security policies');
    console.log('  - Public global content remains accessible');
    console.log('  - Pod content now requires permissions');
    console.log('');
    console.log('🔐 Security improvements:');
    console.log('  ✓ Anonymous users can only see public global content');
    console.log('  ✓ Pod members need knowledgeBaseAccess to view pod content');
    console.log('  ✓ Only managers with knowledgeBaseManage can edit content');
    console.log('  ✓ Direct API access is now properly restricted');

  } catch (error) {
    console.error('❌ Error applying migration:', error);
    throw error;
  } finally {
    await client.end();
  }
}

applyMigration();
