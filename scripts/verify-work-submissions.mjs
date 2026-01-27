import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔍 Verifying work_submissions table...\n');

try {
  // Check if table exists by querying it
  const { count, error } = await supabase
    .from('work_submissions')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('❌ Table verification failed:', error.message);
    process.exit(1);
  }

  console.log('✅ work_submissions table exists!');
  console.log(`📊 Current records: ${count || 0}\n`);

  // Test insertion with a dummy record (then delete it)
  console.log('🧪 Testing insertion permissions...\n');

  const testData = {
    bounty_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
    bid_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
    submitter_address: '0xtest',
    submission_title: 'Test Submission',
    submission_description: 'Test Description',
    status: 'pending'
  };

  const { data, error: insertError } = await supabase
    .from('work_submissions')
    .insert(testData)
    .select()
    .single();

  if (insertError) {
    if (insertError.message.includes('violates foreign key constraint')) {
      console.log('✅ Foreign key constraints are working correctly');
      console.log('   (Dummy bounty/bid IDs were rejected as expected)');
    } else {
      console.log('⚠️  Insertion test failed:', insertError.message);
    }
  } else {
    console.log('✅ Test record inserted successfully');
    console.log('   ID:', data.id);

    // Clean up test record
    await supabase.from('work_submissions').delete().eq('id', data.id);
    console.log('   Test record cleaned up');
  }

  console.log('\n✅ All verifications complete!\n');

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
