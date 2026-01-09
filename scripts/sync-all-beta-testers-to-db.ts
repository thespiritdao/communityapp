/**
 * Sync Beta Tester HATs from blockchain to database
 *
 * All users already have HATs on-chain, but they're missing from pod_members table
 * This script adds them to the database for the permission system
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const BETA_POD_ID = 'af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb';
const BETA_TESTER_HAT = '0x000000880001000b000000000000000000000000000000000000000000000000';

// All beta testers with HATs on-chain
const BETA_TESTERS = [
  { wallet: '0x8a23bde6b8a1832cd7119daed4a794027d74e71e', name: 'Jochen Weber' },
  { wallet: '0x62421b696132bb635feba0e3cb2f305637cb7ead', name: 'Eric Miki' },
  { wallet: '0xdfb6614e9de3822e13de08c6b050a448d417b2d6', name: 'Ryan Munn' },
  { wallet: '0xe3ddfd2b214d51316533181248a4106f83e4934c', name: 'Mariah McKay' },
  { wallet: '0x21498071d1a52830fa398937a9a8f59c69d3fa7a', name: 'Scott Graves' },
  { wallet: '0x0259c4b65866d8f9e596052dbcdfc142c28b6329', name: 'René Pinnell' },
  { wallet: '0xbe03115945680f518e53c4473e0e077ec7272923', name: 'User (incomplete)' },
  { wallet: '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48', name: 'Ron' },
  { wallet: '0xaecf4d00f0e402fbeb0757f22be9062d89018106', name: 'Tressa' },
];

async function syncBetaTestersToDatabase() {
  console.log('📊 Syncing Beta Testers from blockchain to database\n');
  console.log('='.repeat(60));

  let successCount = 0;
  let alreadyExistsCount = 0;
  let errorCount = 0;

  for (const { wallet, name } of BETA_TESTERS) {
    console.log(`\n📍 Processing: ${name} (${wallet})`);

    try {
      // Check if already in database
      const { data: existing, error: checkError } = await supabase
        .from('pod_members')
        .select('*')
        .eq('pod_id', BETA_POD_ID)
        .eq('wallet', wallet.toLowerCase())
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existing) {
        console.log('   ℹ️  Already in database (skipping)');
        alreadyExistsCount++;
        continue;
      }

      // Add to pod_members
      const { error: insertError } = await supabase
        .from('pod_members')
        .insert({
          pod_id: BETA_POD_ID,
          wallet: wallet.toLowerCase(),
          membership_type: 'member',
          role: 'member',
          hat_id: BETA_TESTER_HAT,
          is_active: true,
          joined_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        throw insertError;
      }

      console.log('   ✅ Added to Beta Testers Pod in database');
      successCount++;
    } catch (error) {
      console.error('   ❌ Error:', error instanceof Error ? error.message : error);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Final Summary:');
  console.log(`   ✅ Added to database: ${successCount}`);
  console.log(`   ℹ️  Already in database: ${alreadyExistsCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`   📋 Total processed: ${BETA_TESTERS.length}`);

  // Verify final count
  const { data: allMembers, error: countError } = await supabase
    .from('pod_members')
    .select('wallet')
    .eq('pod_id', BETA_POD_ID)
    .eq('is_active', true);

  if (!countError && allMembers) {
    console.log(`\n🎉 Beta Testers Pod now has ${allMembers.length} members in database!`);

    if (allMembers.length === BETA_TESTERS.length) {
      console.log('✅ All beta testers successfully synced!\n');
      console.log('🔄 Next steps:');
      console.log('   1. Test permissions for all beta testers');
      console.log('   2. Verify they can see Beta Testers Pod features');
      console.log('   3. Check Ron\'s Executive Pod Leader permissions\n');
    }
  }
}

syncBetaTestersToDatabase();
