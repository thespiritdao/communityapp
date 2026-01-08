/**
 * Check Beta Tester HAT Holders from Database
 *
 * Queries the database for all user wallet addresses and checks if they hold the Beta Tester HAT.
 *
 * Usage:
 *   npx tsx scripts/check-beta-testers-from-db.ts
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load .env.local first, then .env
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const HATS_PROTOCOL_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as `0x${string}`;
const BETA_TESTER_HAT = process.env.NEXT_PUBLIC_BETA_TESTER_HAT as `0x${string}`;

const HATS_ABI = parseAbi([
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
  'function isWearerOfHat(address user, uint256 hatId) external view returns (bool)',
  'function hatSupply(uint256 hatId) external view returns (uint32)',
]);

async function main() {
  console.log('🔍 Checking Beta Tester HAT holders from database...\n');

  if (!BETA_TESTER_HAT) {
    console.error('❌ NEXT_PUBLIC_BETA_TESTER_HAT not configured');
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials not configured');
    process.exit(1);
  }

  console.log(`🎩 Beta Tester HAT ID: ${BETA_TESTER_HAT}\n`);

  const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check current supply
  console.log('📊 Checking on-chain supply...');
  const supply = await publicClient.readContract({
    address: HATS_PROTOCOL_ADDRESS,
    abi: HATS_ABI,
    functionName: 'hatSupply',
    args: [BigInt(BETA_TESTER_HAT)],
  });

  console.log(`   Current supply: ${supply} holders\n`);

  // Get all user wallet addresses from database
  console.log('🔎 Fetching user wallets from database...');
  const { data: profiles, error } = await supabase
    .from('user_profiles')
    .select('wallet_address')
    .order('wallet_address');

  if (error) {
    console.error('❌ Database error:', error);
    process.exit(1);
  }

  if (!profiles || profiles.length === 0) {
    console.log('⚠️ No user profiles found in database');
    process.exit(0);
  }

  console.log(`   Found ${profiles.length} user wallets\n`);

  console.log('🔍 Checking each wallet for Beta Tester HAT...');
  console.log('─'.repeat(70));

  const holders: string[] = [];

  for (const profile of profiles) {
    const wallet = profile.wallet_address;

    try {
      const isWearer = await publicClient.readContract({
        address: HATS_PROTOCOL_ADDRESS,
        abi: HATS_ABI,
        functionName: 'isWearerOfHat',
        args: [wallet as `0x${string}`, BigInt(BETA_TESTER_HAT)],
      });

      if (isWearer) {
        holders.push(wallet);
        console.log(`✅ ${wallet}`);
      }
    } catch (err) {
      console.log(`⚠️ ${wallet} (check failed)`);
    }
  }

  console.log('─'.repeat(70));
  console.log(`\n📊 Summary:`);
  console.log(`   Total users in database: ${profiles.length}`);
  console.log(`   Beta Tester HAT holders: ${holders.length}`);
  console.log(`   On-chain supply: ${supply}`);

  if (holders.length === 0) {
    console.log('\n⚠️ No Beta Tester HAT holders found among database users.');
    console.log('   This suggests either:');
    console.log('   1. The HATs were minted to addresses not in user_profiles');
    console.log('   2. The HATs were revoked or burned');
    console.log('   3. Users have not onboarded yet');
  } else {
    console.log('\n✅ Beta Tester HAT distribution looks correct!');
  }
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
