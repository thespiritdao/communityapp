import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixExistingBounties() {
  console.log('\n🔧 Fixing existing bounties with NULL onchain_id...\n');

  // Find bounties with transaction_hash but no onchain_id
  const { data: bountiesToFix, error: fetchError } = await supabase
    .from('bounties')
    .select('id, title, transaction_hash, status, onchain_id')
    .not('transaction_hash', 'is', null)
    .is('onchain_id', null);

  if (fetchError) {
    console.error('❌ Error fetching bounties:', fetchError);
    return;
  }

  console.log(`Found ${bountiesToFix?.length || 0} bounties to fix:\n`);

  for (const bounty of bountiesToFix || []) {
    console.log(`📝 ${bounty.title} (${bounty.id.slice(0, 8)}...)`);
    console.log(`   Current status: ${bounty.status}`);
    console.log(`   Transaction: ${bounty.transaction_hash}`);

    // Update status to 'pending' so cron job will pick it up
    const { error: updateError } = await supabase
      .from('bounties')
      .update({ status: 'pending' })
      .eq('id', bounty.id);

    if (updateError) {
      console.error(`   ❌ Failed to update: ${updateError.message}`);
    } else {
      console.log(`   ✅ Updated to status: 'pending'`);
    }
    console.log('');
  }

  console.log('\n✅ Done! Now run the cron job to confirm these bounties.');
}

fixExistingBounties()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
