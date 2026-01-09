// Verify Ron's HAT ownership on-chain vs database
import { createClient } from '@supabase/supabase-js';
import { ethers } from 'ethers';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RON_WALLET = '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48';

// Base mainnet Hats Protocol contract
const HATS_CONTRACT = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
const BASE_RPC = 'https://mainnet.base.org';

const HATS_ABI = [
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function isWearerOfHat(address wearer, uint256 hatId) view returns (bool)'
];

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function verifyHats() {
  console.log('🔍 Verifying Ron\'s HAT Ownership\n');
  console.log('Wallet:', RON_WALLET);
  console.log('─'.repeat(80));

  // Get Ron's database memberships
  const { data: dbMemberships } = await supabase
    .from('active_pod_members')
    .select('*')
    .eq('wallet', RON_WALLET.toLowerCase())
    .eq('is_active', true);

  console.log(`\n📊 Database Records (${dbMemberships?.length || 0} memberships):`);
  dbMemberships?.forEach((m, i) => {
    console.log(`\n${i + 1}. ${m.pod_name}`);
    console.log(`   Type: ${m.membership_type}`);
    console.log(`   HAT ID: ${m.hat_id}`);
  });

  // Connect to Base mainnet
  console.log('\n\n🔗 Checking on-chain HAT ownership...');
  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  const hatsContract = new ethers.Contract(HATS_CONTRACT, HATS_ABI, provider);

  console.log('─'.repeat(80));

  for (const membership of dbMemberships || []) {
    console.log(`\n🎩 ${membership.pod_name}`);
    console.log(`   HAT ID: ${membership.hat_id}`);

    try {
      const balance = await hatsContract.balanceOf(RON_WALLET, membership.hat_id);
      const isWearer = await hatsContract.isWearerOfHat(RON_WALLET, membership.hat_id);

      console.log(`   On-chain balance: ${balance.toString()}`);
      console.log(`   Is wearer: ${isWearer ? '✅ YES' : '❌ NO'}`);

      if (!isWearer) {
        console.log('   ⚠️ WARNING: Database says Ron has this HAT, but blockchain says NO!');
      }
    } catch (error) {
      console.error(`   ❌ Error checking on-chain: ${error}`);
    }
  }

  console.log('\n' + '─'.repeat(80));
  console.log('\n📋 Summary:');
  console.log('   Database shows Ron has:');
  dbMemberships?.forEach(m => {
    console.log(`     - ${m.pod_name} (${m.membership_type})`);
  });
}

verifyHats().catch(console.error);
