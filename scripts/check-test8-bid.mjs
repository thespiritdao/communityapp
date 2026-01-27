import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking Test8 bounty bid...\n');

// Get Test8 bounty
const { data: bounties, error: bountyError } = await supabase
  .from('bounties')
  .select('*')
  .eq('title', 'Test8')
  .order('created_at', { ascending: false })
  .limit(1);

if (bountyError) {
  console.error('❌ Error fetching bounty:', bountyError);
  process.exit(1);
}

if (!bounties || bounties.length === 0) {
  console.log('⚠️ No Test8 bounty found');
  process.exit(0);
}

const bounty = bounties[0];
console.log('📦 Bounty:', {
  id: bounty.id,
  title: bounty.title,
  onchain_id: bounty.onchain_id,
  status: bounty.status,
});

// Get bids for this bounty
const { data: bids, error: bidError } = await supabase
  .from('bids')
  .select('*')
  .eq('bounty_id', bounty.id)
  .order('submitted_at', { ascending: false });

if (bidError) {
  console.error('❌ Error fetching bids:', bidError);
  process.exit(1);
}

console.log(`\n📋 Found ${bids.length} bid(s):\n`);

for (const bid of bids) {
  console.log('─'.repeat(80));
  console.log('Bid ID:', bid.id);
  console.log('Bidder:', bid.bidder_address);
  console.log('Status:', bid.status);
  console.log('\n🔗 On-chain tracking fields:');
  console.log('  onchain_bid_index:', bid.onchain_bid_index, `(type: ${typeof bid.onchain_bid_index})`);
  console.log('  placement_tx_hash:', bid.placement_tx_hash);
  console.log('  bid_ipfs_hash:', bid.bid_ipfs_hash);

  console.log('\n✅ Field validation:');
  console.log('  Has onchain_bid_index:', bid.onchain_bid_index !== undefined && bid.onchain_bid_index !== null);
  console.log('  Is falsy (0 check):', !bid.onchain_bid_index);
  console.log('  Strict check (=== 0):', bid.onchain_bid_index === 0);
  console.log('  Loose check (== 0):', bid.onchain_bid_index == 0);

  console.log('\n📊 Full bid object keys:');
  console.log('  ', Object.keys(bid).sort().join(', '));
}

console.log('\n' + '─'.repeat(80));
console.log('✅ Check complete');
