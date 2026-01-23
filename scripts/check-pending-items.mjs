import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkPendingItems() {
  console.log('\n🔍 Checking for pending bounties and bids...\n');

  // Check bounties
  console.log('📋 BOUNTIES:');
  console.log('─'.repeat(80));

  const { data: allBounties, error: allError } = await supabase
    .from('bounties')
    .select('id, title, status, transaction_hash, blockchain_id, onchain_id, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (allError) {
    console.error('❌ Error fetching bounties:', allError);
  } else {
    console.log(`\nTotal recent bounties: ${allBounties?.length || 0}\n`);
    allBounties?.forEach((b, i) => {
      console.log(`${i + 1}. ${b.title}`);
      console.log(`   ID: ${b.id}`);
      console.log(`   Status: ${b.status}`);
      console.log(`   Transaction Hash: ${b.transaction_hash || 'NULL'}`);
      console.log(`   Blockchain ID: ${b.blockchain_id || 'NULL'}`);
      console.log(`   Onchain ID: ${b.onchain_id || 'NULL'}`);
      console.log(`   Created: ${new Date(b.created_at).toLocaleString()}`);
      console.log('');
    });
  }

  // Check PENDING bounties (what cron looks for)
  console.log('🔄 PENDING BOUNTIES (what cron job searches for):');
  console.log('─'.repeat(80));
  console.log('Query: status=pending AND transaction_hash IS NOT NULL\n');

  const { data: pendingBounties, error: pendingError } = await supabase
    .from('bounties')
    .select('id, title, status, transaction_hash, blockchain_id, onchain_id, created_at')
    .eq('status', 'pending')
    .not('transaction_hash', 'is', null)
    .order('created_at', { ascending: true });

  if (pendingError) {
    console.error('❌ Error fetching pending bounties:', pendingError);
  } else {
    console.log(`Found: ${pendingBounties?.length || 0} pending bounties\n`);
    pendingBounties?.forEach((b, i) => {
      const age = (Date.now() - new Date(b.created_at).getTime()) / 1000 / 60;
      console.log(`${i + 1}. ${b.title}`);
      console.log(`   ID: ${b.id}`);
      console.log(`   Transaction Hash: ${b.transaction_hash}`);
      console.log(`   Age: ${age.toFixed(1)} minutes`);
      console.log('');
    });
  }

  // Check bids
  console.log('\n📋 BIDS:');
  console.log('─'.repeat(80));

  const { data: allBids, error: bidsError } = await supabase
    .from('bids')
    .select('id, bounty_id, bidder_address, status, placement_tx_hash, onchain_bid_index, submitted_at')
    .order('submitted_at', { ascending: false })
    .limit(10);

  if (bidsError) {
    console.error('❌ Error fetching bids:', bidsError);
  } else {
    console.log(`\nTotal recent bids: ${allBids?.length || 0}\n`);
    allBids?.forEach((b, i) => {
      console.log(`${i + 1}. Bid ${b.id.slice(0, 8)}...`);
      console.log(`   Bounty ID: ${b.bounty_id.slice(0, 8)}...`);
      console.log(`   Bidder: ${b.bidder_address}`);
      console.log(`   Status: ${b.status}`);
      console.log(`   Placement TX: ${b.placement_tx_hash || 'NULL'}`);
      console.log(`   Onchain Index: ${b.onchain_bid_index ?? 'NULL'}`);
      console.log(`   Submitted: ${new Date(b.submitted_at).toLocaleString()}`);
      console.log('');
    });
  }

  // Check PENDING bids (what cron looks for)
  console.log('🔄 PENDING BIDS (what cron job searches for):');
  console.log('─'.repeat(80));
  console.log('Query: placement_tx_hash IS NOT NULL AND onchain_bid_index IS NULL\n');

  const { data: pendingBids, error: pendingBidsError } = await supabase
    .from('bids')
    .select('id, bounty_id, bidder_address, status, placement_tx_hash, onchain_bid_index, submitted_at')
    .not('placement_tx_hash', 'is', null)
    .is('onchain_bid_index', null)
    .order('submitted_at', { ascending: true });

  if (pendingBidsError) {
    console.error('❌ Error fetching pending bids:', pendingBidsError);
  } else {
    console.log(`Found: ${pendingBids?.length || 0} pending bids\n`);
    pendingBids?.forEach((b, i) => {
      const age = (Date.now() - new Date(b.submitted_at).getTime()) / 1000 / 60;
      console.log(`${i + 1}. Bid ${b.id.slice(0, 8)}...`);
      console.log(`   Bounty ID: ${b.bounty_id.slice(0, 8)}...`);
      console.log(`   Placement TX: ${b.placement_tx_hash}`);
      console.log(`   Age: ${age.toFixed(1)} minutes`);
      console.log('');
    });
  }
}

checkPendingItems()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
