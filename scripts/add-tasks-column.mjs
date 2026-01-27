import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addTasksColumn() {
  try {
    console.log('📝 Checking if tasks column exists...\n');

    // Try to select tasks column to see if it exists
    const { data: testData, error: testError } = await supabase
      .from('bounties')
      .select('tasks')
      .limit(1);

    if (testError) {
      if (testError.code === '42703') {
        console.log('❌ Tasks column does not exist');
        console.log('\n⚠️ Unable to add column via Supabase client.');
        console.log('Please run this SQL manually in Supabase Dashboard:\n');
        console.log('ALTER TABLE bounties ADD COLUMN tasks JSONB DEFAULT \'[]\'::jsonb;\n');
      } else {
        console.error('Error:', testError);
      }
    } else {
      console.log('✅ Tasks column already exists!');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

addTasksColumn();
