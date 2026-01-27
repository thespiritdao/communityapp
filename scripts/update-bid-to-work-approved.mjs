import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const BID_ID = '795c5f0f-fcb4-4679-bfc6-efdd9cdf8834';

console.log('🔄 Updating bid status to work_approved...\n');
console.log('Bid ID:', BID_ID);
console.log('');

try {
  const { data, error } = await supabase
    .from('bids')
    .update({
      status: 'work_approved',
    })
    .eq('id', BID_ID)
    .select()
    .single();

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log('✅ Bid updated successfully!');
  console.log('');
  console.log('Updated bid:');
  console.log('  ID:', data.id);
  console.log('  Status:', data.status);
  console.log('  Updated at:', data.updated_at);
  console.log('');
  console.log('The bounty should now appear in the Pay tab.');

} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
