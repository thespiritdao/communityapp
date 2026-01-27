import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔍 Checking work submissions...\n');

const { data: submissions, error } = await supabase
  .from('work_submissions')
  .select('*')
  .order('created_at', { ascending: false });

if (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}

console.log(`Found ${submissions.length} work submission(s):\n`);

submissions.forEach((sub, i) => {
  console.log(`${i + 1}. ${sub.submission_title || 'Untitled'}`);
  console.log(`   ID: ${sub.id}`);
  console.log(`   Bounty ID: ${sub.bounty_id}`);
  console.log(`   Bid ID: ${sub.bid_id}`);
  console.log(`   Submitter: ${sub.submitter_address}`);
  console.log(`   Status: ${sub.status}`);
  console.log(`   Revision: ${sub.revision_number}`);
  console.log(`   Created: ${new Date(sub.created_at).toLocaleString()}`);
  console.log('');
});
