/**
 * Directly mint Beta Tester HATs on blockchain
 * Bypasses API and mints directly using admin wallet
 */

import { createClient } from '@supabase/supabase-js';
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BETA_POD_ID = 'af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb';
const BETA_TESTER_HAT = '0x000000880001000b000000000000000000000000000000000000000000000000';
const HATS_CONTRACT = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as `0x${string}`;

// Beta testers who need HATs
const BETA_TESTERS_NEED_HATS = [
  '0x8a23bde6b8a1832cd7119daed4a794027d74e71e', // Jochen Weber
  '0x62421b696132bb635feba0e3cb2f305637cb7ead', // Eric Miki
  '0xdfb6614e9de3822e13de08c6b050a448d417b2d6', // Ryan Munn
  '0xe3ddfd2b214d51316533181248a4106f83e4934c', // Mariah McKay
  '0x21498071d1a52830fa398937a9a8f59c69d3fa7a', // Scott Graves
  '0x0259c4b65866d8f9e596052dbcdfc142c28b6329', // René Pinnell
  '0xbe03115945680f518e53c4473e0e077ec7272923', // Incomplete profile
];

const HATS_ABI = parseAbi([
  'function mintHat(uint256 _hatId, address _wearer) external returns (bool)',
  'function isWearerOfHat(address _user, uint256 _hatId) external view returns (bool)',
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
]);

async function mintBetaHATsDirect() {
  console.log('🎩 Minting Beta Tester HATs directly on blockchain\n');
  console.log('='.repeat(60));

  // Setup wallet
  const ADMIN_PRIVATE_KEY = process.env.POD_ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY;

  if (!ADMIN_PRIVATE_KEY) {
    console.error('❌ No admin private key found!');
    console.error('   Set POD_ADMIN_PRIVATE_KEY or PRIVATE_KEY in .env');
    return;
  }

  const adminAccount = privateKeyToAccount(ADMIN_PRIVATE_KEY as `0x${string}`);
  console.log(`🔑 Admin wallet: ${adminAccount.address}\n`);

  const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account: adminAccount,
    chain: base,
    transport: http(RPC_URL),
  });

  // Verify admin has Executive Pod Leader HAT
  console.log('🔍 Verifying admin permissions...');
  const EXEC_POD_LEADER_HAT = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER!;
  const isAdmin = await publicClient.readContract({
    address: HATS_CONTRACT,
    abi: HATS_ABI,
    functionName: 'isWearerOfHat',
    args: [adminAccount.address, BigInt(EXEC_POD_LEADER_HAT)],
  });

  if (!isAdmin) {
    console.error('❌ Admin wallet does not wear Executive Pod Leader HAT!');
    console.error(`   Admin: ${adminAccount.address}`);
    console.error(`   Required HAT: ${EXEC_POD_LEADER_HAT}`);
    return;
  }

  console.log('✅ Admin verified - has Executive Pod Leader HAT\n');
  console.log('='.repeat(60));

  let successCount = 0;
  let alreadyHadCount = 0;
  let errorCount = 0;

  for (const wallet of BETA_TESTERS_NEED_HATS) {
    console.log(`\n📍 Processing: ${wallet}`);

    try {
      // Check if already has HAT
      const balance = await publicClient.readContract({
        address: HATS_CONTRACT,
        abi: HATS_ABI,
        functionName: 'balanceOf',
        args: [wallet as `0x${string}`, BigInt(BETA_TESTER_HAT)],
      });

      if (balance > 0n) {
        console.log('   ℹ️  Already has Beta Tester HAT (skipping)');
        alreadyHadCount++;
        continue;
      }

      // Mint the HAT
      console.log('   📤 Minting Beta Tester HAT...');
      const hash = await walletClient.writeContract({
        address: HATS_CONTRACT,
        abi: HATS_ABI,
        functionName: 'mintHat',
        args: [BigInt(BETA_TESTER_HAT), wallet as `0x${string}`],
      });

      console.log(`   ⏳ Transaction: ${hash}`);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 60_000,
      });

      if (receipt.status === 'success') {
        console.log(`   ✅ HAT minted successfully!`);
        console.log(`   📦 Block: ${receipt.blockNumber}`);
        console.log(`   ⛽ Gas used: ${receipt.gasUsed}`);
        successCount++;

        // Add to database
        const { error: dbError } = await supabase
          .from('pod_members')
          .upsert({
            pod_id: BETA_POD_ID,
            wallet: wallet.toLowerCase(),
            membership_type: 'member',
            role: 'member',
            hat_id: BETA_TESTER_HAT,
            is_active: true,
            joined_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'pod_id,wallet'
          });

        if (dbError) {
          console.warn('   ⚠️  Database sync failed:', dbError.message);
        } else {
          console.log('   ✅ Added to Beta Testers Pod in database');
        }
      } else {
        console.error('   ❌ Transaction failed');
        errorCount++;
      }
    } catch (error) {
      console.error('   ❌ Error:', error instanceof Error ? error.message : error);
      errorCount++;
    }

    // Wait between mints
    if (successCount + errorCount < BETA_TESTERS_NEED_HATS.length) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Final Summary:');
  console.log(`   ✅ Successfully minted: ${successCount}`);
  console.log(`   ℹ️  Already had HAT: ${alreadyHadCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`   📋 Total processed: ${BETA_TESTERS_NEED_HATS.length}`);

  if (successCount > 0) {
    console.log('\n🎉 HAT minting complete!');
    console.log('\n🔄 Next steps:');
    console.log('   1. Verify HATs on Basescan');
    console.log('   2. Sync Beta Testers Pod at /admin/sync-pod-members');
    console.log('   3. Test permissions for beta testers');
  }

  console.log('');
}

mintBetaHATsDirect();
