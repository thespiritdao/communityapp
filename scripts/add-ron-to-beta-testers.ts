// Add Ron to Beta Testers Pod in active_pod_members table
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RON_WALLET = '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48';
const BETA_TESTER_HAT = '0x000000880001000b000000000000000000000000000000000000000000000000';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function addRonToBetaTesters() {
  console.log('🔧 Adding Ron to Beta Testers Pod\n');

  // Get Beta Testers Pod info
  const { data: betaPod, error: podError } = await supabase
    .from('pods')
    .select('*')
    .eq('name', 'Beta Testers Pod')
    .single();

  if (podError || !betaPod) {
    console.error('❌ Could not find Beta Testers Pod:', podError);
    return;
  }

  console.log('📋 Beta Testers Pod:');
  console.log(`   ID: ${betaPod.id}`);
  console.log(`   Management HAT: ${betaPod.management_hat_id}`);
  console.log(`   Membership HAT: ${betaPod.membership_hat_id}`);

  // Check if Ron already exists in pod_members for Beta Testers Pod
  const { data: existing, error: checkError } = await supabase
    .from('pod_members')
    .select('*')
    .eq('wallet', RON_WALLET.toLowerCase())
    .eq('pod_id', betaPod.id)
    .maybeSingle();

  if (checkError) {
    console.error('❌ Error checking existing membership:', checkError);
    return;
  }

  if (existing) {
    console.log('⚠️ Ron already has a record in pod_members for Beta Testers Pod');
    console.log('   Current record:', existing);

    // Update to leader if not already
    if (existing.membership_type !== 'leader' || !existing.is_active) {
      console.log('🔄 Updating existing record to leader...');
      const { error: updateError } = await supabase
        .from('pod_members')
        .update({
          membership_type: 'leader',
          role: 'leader', // Duplicate field in schema
          is_active: true,
          hat_id: betaPod.management_hat_id,
          removed_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('pod_id', betaPod.id)
        .eq('wallet', RON_WALLET.toLowerCase());

      if (updateError) {
        console.error('❌ Update failed:', updateError);
      } else {
        console.log('✅ Updated Ron to Beta Tester Leader');
      }
    } else {
      console.log('✅ Membership is already active - nothing to do');
    }
    return;
  }

  // Insert new record
  console.log('\n➕ Inserting Ron as Beta Tester Leader...');
  const { data: inserted, error: insertError } = await supabase
    .from('pod_members')
    .insert({
      pod_id: betaPod.id,
      wallet: RON_WALLET.toLowerCase(),
      hat_id: betaPod.management_hat_id,
      membership_type: 'leader',
      role: 'leader', // Duplicate field in schema
      is_active: true,
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select();

  if (insertError) {
    console.error('❌ Insert failed:', insertError);
    return;
  }

  console.log('✅ Successfully added Ron to Beta Testers Pod!');
  console.log('   Record:', inserted);

  // Verify
  console.log('\n🔍 Verifying Ron\'s memberships...');
  const { data: allMemberships } = await supabase
    .from('active_pod_members')
    .select('*')
    .eq('wallet', RON_WALLET.toLowerCase())
    .eq('is_active', true);

  console.log(`\nTotal active memberships: ${allMemberships?.length || 0}`);
  allMemberships?.forEach((m, i) => {
    console.log(`\n${i + 1}. ${m.pod_name}`);
    console.log(`   Type: ${m.membership_type}`);
    console.log(`   HAT: ${m.hat_id}`);
  });
}

addRonToBetaTesters().catch(console.error);
