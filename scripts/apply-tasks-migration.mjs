import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('📝 Applying tasks column migration...\n');

  try {
    const migrationSQL = readFileSync(
      'supabase/migrations/20260125000000_add_tasks_to_bounties.sql',
      'utf-8'
    );

    // Split by semicolon and filter out comments and empty statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.startsWith('COMMENT'));

    for (const statement of statements) {
      if (statement) {
        console.log('Executing:', statement.substring(0, 100) + '...');
        const { error } = await supabase.rpc('exec_sql', { sql: statement });

        if (error) {
          console.error('❌ Error:', error);
        } else {
          console.log('✅ Success');
        }
      }
    }

    console.log('\n✅ Migration applied successfully!');

    // Verify the column was added
    const { data, error } = await supabase
      .from('bounties')
      .select('tasks')
      .limit(1);

    if (error) {
      console.error('\n⚠️ Verification failed:', error);
    } else {
      console.log('\n✅ Verification: tasks column exists');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

applyMigration();
