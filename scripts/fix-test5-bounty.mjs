import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixTest5() {
  console.log('\n🔧 Fixing test5 bounty status to pending...\n');

  const { data, error } = await supabase
    .from('bounties')
    .update({ status: 'pending' })
    .eq('title', 'test5')
    .select();

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log('✅ Updated test5 to pending status');
  console.log(JSON.stringify(data, null, 2));
  console.log('\n Now run: node scripts/test-bounty-cron.mjs');
}

fixTest5()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
