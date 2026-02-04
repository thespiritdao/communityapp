/**
 * Apply RLS policies for forum_post_reactions
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('🔐 Applying RLS policies for forum_post_reactions...\n');

  try {
    // Read migration file
    const migrationSQL = fs.readFileSync(
      './supabase/migrations/20260129000000_add_forum_reactions_rls.sql',
      'utf-8'
    );

    // Execute migration
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      console.error('❌ Error applying migration:', error);

      // Try alternative approach - execute statements individually
      console.log('\n🔄 Trying alternative approach...\n');

      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        console.log('Executing:', statement.substring(0, 100) + '...');
        const { error: stmtError } = await supabase.rpc('exec_sql', { sql: statement });
        if (stmtError) {
          console.error('❌ Error:', stmtError.message);
        } else {
          console.log('✅ Success');
        }
      }
    } else {
      console.log('✅ Migration applied successfully!');
    }

    console.log('\n📋 Verifying policies...\n');

    // Verify policies were created
    const { data: policies, error: policiesError } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT policyname, cmd, qual
          FROM pg_policies
          WHERE tablename = 'forum_post_reactions';
        `
      });

    if (policiesError) {
      console.warn('⚠️ Could not verify policies:', policiesError.message);
    } else if (policies) {
      console.log('Current policies on forum_post_reactions:');
      console.log(policies);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main().catch(console.error);
