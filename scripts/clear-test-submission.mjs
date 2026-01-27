import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🧹 Clearing test work submission...\n');

const { data: submissions, error: fetchError } = await supabase
  .from('work_submissions')
  .select('*')
  .order('created_at', { ascending: false });

if (fetchError) {
  console.error('❌ Error fetching submissions:', fetchError);
  process.exit(1);
}

console.log(`Found ${submissions.length} submission(s):\n`);

submissions.forEach((sub, i) => {
  console.log(`${i + 1}. ${sub.submission_title || 'Untitled'}`);
  console.log(`   ID: ${sub.id}`);
  console.log(`   Status: ${sub.status}`);
  console.log(`   Created: ${new Date(sub.created_at).toLocaleString()}`);
  console.log('');
});

if (submissions.length > 0) {
  console.log('🗑️  Deleting all test submissions...\n');

  for (const sub of submissions) {
    const { error: deleteError } = await supabase
      .from('work_submissions')
      .delete()
      .eq('id', sub.id);

    if (deleteError) {
      console.error(`❌ Failed to delete ${sub.id}:`, deleteError.message);
    } else {
      console.log(`✅ Deleted: ${sub.submission_title || sub.id}`);
    }
  }

  console.log('\n✅ All test submissions cleared!');
} else {
  console.log('✅ No submissions to clear.');
}
