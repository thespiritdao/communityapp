import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BOUNTY_ID = '254bd89f-6f54-450a-acf6-da13d541dcd6';
const ONCHAIN_ID = '5';
const TX_HASH = '0xdedc881b9c990ab2cd57fb5337224190e792f5cab03d5b91de6438f14622d13a';

async function updateBounty() {
  console.log('\n📝 Updating bounty with on-chain data...');
  console.log(`   Bounty ID: ${BOUNTY_ID}`);
  console.log(`   On-chain ID: ${ONCHAIN_ID}`);
  console.log(`   Transaction: ${TX_HASH}\n`);

  const { data, error } = await supabase
    .from('bounties')
    .update({
      blockchain_id: ONCHAIN_ID,
      onchain_id: ONCHAIN_ID,
      transaction_hash: TX_HASH,
      status: 'open',
      updated_at: new Date().toISOString(),
    })
    .eq('id', BOUNTY_ID)
    .select();

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log('✅ Bounty updated successfully!');
  console.log(JSON.stringify(data, null, 2));
}

updateBounty()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
