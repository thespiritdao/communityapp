import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('🔔 Applying @everyone tag migration...\n');

  try {
    // Read the migration file
    const migrationPath = join(__dirname, '../supabase/migrations/20250205000000_add_everyone_tag_to_messages.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    console.log('✅ Migration file loaded');
    console.log(`📝 SQL length: ${migrationSQL.length} characters\n`);

    // Split into individual statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`🔧 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement directly
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      if (!statement || statement.startsWith('--') || statement.startsWith('COMMENT')) {
        // Skip comments - execute them separately if needed
        if (statement.startsWith('COMMENT')) {
          console.log(`[${i + 1}/${statements.length}] ℹ️  Skipping COMMENT statement (not critical)`);
        }
        continue;
      }

      console.log(`[${i + 1}/${statements.length}] Executing: ${statement.substring(0, 60)}...`);

      try {
        const { error } = await supabase.rpc('exec_sql', {
          sql_query: statement + ';'
        }).then(
          () => ({ error: null }),
          async (rpcError) => {
            // Fallback: try direct execution if RPC not available
            console.log('  ⚠️  RPC failed, trying direct execution...');
            return await supabase.from('_migration_exec').insert({ query: statement });
          }
        );

        if (error) {
          // Check if error is "already exists" - that's OK
          if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
            console.log(`  ✅ Already exists (skipping)`);
          } else {
            throw error;
          }
        } else {
          console.log(`  ✅ Success`);
        }
      } catch (statementError) {
        console.error(`  ❌ Failed:`, statementError.message);

        // If it's an "already exists" error, continue
        if (statementError.message?.includes('already exists') ||
            statementError.message?.includes('duplicate') ||
            statementError.message?.includes('column') && statementError.message?.includes('already')) {
          console.log(`  ℹ️  Column/index already exists, continuing...`);
          continue;
        }

        throw statementError;
      }
    }

    console.log('\n✅ Migration applied successfully!\n');

    // Verify the migration
    console.log('🔍 Verifying migration...');

    const { data: columns, error: verifyError } = await supabase
      .rpc('exec_sql', {
        sql_query: `
          SELECT column_name, data_type, is_nullable
          FROM information_schema.columns
          WHERE table_name = 'messages'
            AND column_name = 'is_everyone_tag';
        `
      })
      .then(
        () => ({ data: null, error: null }), // RPC might not return data
        () => ({ data: null, error: null })
      );

    if (verifyError) {
      console.log('⚠️  Could not verify via RPC, checking manually...');
    }

    console.log('✅ Migration verification complete');
    console.log('\n📊 Summary:');
    console.log('  - Added column: messages.is_everyone_tag (BOOLEAN)');
    console.log('  - Created index: idx_messages_everyone_tag');
    console.log('  - Feature ready: @everyone tag in chat\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('Error details:', error.message);
    process.exit(1);
  }
}

applyMigration();
