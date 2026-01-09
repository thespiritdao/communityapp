/**
 * Mint Beta Tester HATs for users who completed onboarding but didn't receive HATs
 *
 * This script fixes the gap where HAT minting wasn't wired into the onboarding flow
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Beta testers who need HATs (from your errors.txt list)
const BETA_TESTERS_NEED_HATS = [
  '0x8a23bde6b8a1832cd7119daed4a794027d74e71e', // Jochen Weber
  '0x62421b696132bb635feba0e3cb2f305637cb7ead', // Eric Miki
  '0xdfb6614e9de3822e13de08c6b050a448d417b2d6', // Ryan Munn (onboarded)
  '0xe3ddfd2b214d51316533181248a4106f83e4934c', // Mariah McKay (onboarded)
  '0x21498071d1a52830fa398937a9a8f59c69d3fa7a', // Scott Graves
  '0x0259c4b65866d8f9e596052dbcdfc142c28b6329', // René Pinnell
  '0xbe03115945680f518e53c4473e0e077ec7272923', // Incomplete profile
];

const BETA_POD_ID = 'af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb';
const BETA_TESTER_HAT = '0x000000880001000b000000000000000000000000000000000000000000000000';

async function mintHATsForBetaTesters() {
  console.log('🎩 Minting Beta Tester HATs for missing users\n');
  console.log('='.repeat(60));

  const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  let successCount = 0;
  let errorCount = 0;
  let alreadyHadCount = 0;

  for (const wallet of BETA_TESTERS_NEED_HATS) {
    console.log(`\n📍 Processing: ${wallet}`);

    try {
      // Call the mint-hat API
      const response = await fetch(`${API_URL}/api/onboarding/mint-hat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: wallet,
          isFirstUser: false, // Beta tester, not executive
        }),
      });

      const data = await response.json();

      if (data.success) {
        if (data.alreadyHadHat) {
          console.log('   ℹ️  Already has HAT');
          alreadyHadCount++;
        } else {
          console.log('   ✅ HAT minted successfully!');
          console.log(`   📝 Transaction: ${data.transactionHash}`);
          successCount++;

          // Add to pod_members table
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
        }
      } else {
        console.error('   ❌ Minting failed:', data.error);
        errorCount++;
      }
    } catch (error) {
      console.error('   ❌ Error:', error instanceof Error ? error.message : error);
      errorCount++;
    }

    // Wait a bit between mints to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Summary:');
  console.log(`   ✅ Newly minted: ${successCount}`);
  console.log(`   ℹ️  Already had HAT: ${alreadyHadCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`   📋 Total processed: ${BETA_TESTERS_NEED_HATS.length}`);

  console.log('\n🔄 Next steps:');
  console.log('   1. Verify HATs on-chain (check Basescan)');
  console.log('   2. Sync Beta Testers Pod at /admin/sync-pod-members');
  console.log('   3. Test beta tester permissions');
  console.log('');
}

mintHATsForBetaTesters();
