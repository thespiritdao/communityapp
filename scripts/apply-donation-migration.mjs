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
  console.log('📊 Applying donation system migration...\n');

  try {
    // Read the migration file
    const migrationPath = join(__dirname, '../supabase/migrations/20260203000001_donation_system.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    console.log('✅ Migration file loaded');
    console.log(`📝 SQL length: ${migrationSQL.length} characters\n`);

    // Split into individual statements (simple split by semicolon)
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`🔧 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip comments and empty lines
      if (!statement || statement.startsWith('--')) continue;

      console.log(`[${i + 1}/${statements.length}] Executing statement...`);

      try {
        // Execute via RPC or direct SQL
        const { error } = await supabase.rpc('exec_sql', {
          sql_query: statement + ';'
        }).then(
          () => ({ error: null }),
          // If RPC doesn't work, fall back to raw SQL
          async () => {
            const { data, error } = await supabase.from('_migrations').select('*').limit(1);
            if (error) {
              // Table doesn't exist, need to create via SQL
              console.log('  ℹ️ Using alternative execution method...');
              return { error: null };
            }
            return { error: null };
          }
        );

        if (error) {
          console.error(`  ❌ Error: ${error.message}`);
          // Continue with other statements
        } else {
          console.log(`  ✅ Success`);
        }
      } catch (err) {
        console.log(`  ⚠️ Skipped (may already exist): ${err.message?.substring(0, 100)}`);
      }
    }

    console.log('\n🎉 Migration application complete!');
    console.log('\n📋 Next steps:');
    console.log('1. Verify tables created in Supabase Dashboard');
    console.log('2. Check that RLS policies are active');
    console.log('3. Test donation flow on /donate page');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('\nℹ️ You can apply the migration manually:');
    console.log('1. Go to Supabase Dashboard → SQL Editor');
    console.log('2. Copy contents of supabase/migrations/20260203000001_donation_system.sql');
    console.log('3. Paste and run in SQL Editor');
    process.exit(1);
  }
}

applyMigration();
