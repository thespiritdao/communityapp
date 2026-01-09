/**
 * Transfer pod ownership from old Ron account to new Ron account
 *
 * Old Ron: 0x12a0cf22d632c859b793f852af03b9d515580244
 * New Ron: 0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48
 *
 * Pods to transfer:
 * - Executive Pod (e35c9e25-d29f-4988-b1e8-2902e960b94c)
 * - Community Pod (86d2d359-2e38-4267-b7b7-c7f6155063e2)
 * - Top Hat (5754d810-7729-4a48-a0bb-31774175dcc1)
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const OLD_RON = '0x12a0cf22d632c859b793f852af03b9d515580244';
const NEW_RON = '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48';

const PODS_TO_TRANSFER = [
  { id: 'e35c9e25-d29f-4988-b1e8-2902e960b94c', name: 'Executive Pod' },
  { id: '86d2d359-2e38-4267-b7b7-c7f6155063e2', name: 'Community Pod' },
  { id: '5754d810-7729-4a48-a0bb-31774175dcc1', name: 'Top Hat' },
];

async function transferPodsToNewRon() {
  console.log('🔄 Transferring pod ownership from old Ron to new Ron\n');
  console.log('='.repeat(60));
  console.log(`Old Ron: ${OLD_RON}`);
  console.log(`New Ron: ${NEW_RON}`);
  console.log('='.repeat(60));

  for (const { id: podId, name: podName } of PODS_TO_TRANSFER) {
    console.log(`\n📍 Processing: ${podName} (${podId})`);

    try {
      // Step 1: Update pod_members table - transfer old Ron's membership to new Ron
      console.log('   1️⃣ Updating pod_members...');

      // Remove old Ron
      const { error: deleteError } = await supabase
        .from('pod_members')
        .delete()
        .eq('pod_id', podId)
        .eq('wallet', OLD_RON.toLowerCase());

      if (deleteError && deleteError.code !== 'PGRST116') {
        console.warn('   ⚠️  Failed to remove old Ron:', deleteError.message);
      } else {
        console.log('   ✅ Removed old Ron from pod_members');
      }

      // Check if new Ron already exists
      const { data: existing, error: checkError } = await supabase
        .from('pod_members')
        .select('*')
        .eq('pod_id', podId)
        .eq('wallet', NEW_RON.toLowerCase())
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (!existing) {
        // Get HAT ID from pod
        const { data: podData, error: podError } = await supabase
          .from('pods')
          .select('management_hat_id')
          .eq('id', podId)
          .single();

        if (podError) {
          throw podError;
        }

        // Add new Ron
        const { error: insertError } = await supabase
          .from('pod_members')
          .insert({
            pod_id: podId,
            wallet: NEW_RON.toLowerCase(),
            membership_type: 'leader',
            role: 'leader',
            hat_id: podData.management_hat_id,
            is_active: true,
            joined_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (insertError) {
          throw insertError;
        }

        console.log('   ✅ Added new Ron as leader');
      } else {
        console.log('   ℹ️  New Ron already exists as member');
      }

      // Step 2: Update pods.pod_leads array
      console.log('   2️⃣ Updating pod_leads...');

      const { data: podData, error: podFetchError } = await supabase
        .from('pods')
        .select('pod_leads')
        .eq('id', podId)
        .single();

      if (podFetchError) {
        throw podFetchError;
      }

      let podLeads = podData.pod_leads || [];

      // Remove old Ron, add new Ron
      podLeads = podLeads.filter((addr: string) => addr.toLowerCase() !== OLD_RON.toLowerCase());
      if (!podLeads.some((addr: string) => addr.toLowerCase() === NEW_RON.toLowerCase())) {
        podLeads.push(NEW_RON);
      }

      const { error: updateError } = await supabase
        .from('pods')
        .update({ pod_leads: podLeads })
        .eq('id', podId);

      if (updateError) {
        throw updateError;
      }

      console.log('   ✅ Updated pod_leads array');

      console.log(`   ✅ ${podName} ownership transferred!`);
    } catch (error) {
      console.error(`   ❌ Error transferring ${podName}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Pod ownership transfer complete!');
  console.log('\n🔄 Next steps:');
  console.log('   1. Verify new Ron can see management options for all 3 pods');
  console.log('   2. Test permissions in production');
  console.log('   3. Consider deleting old Ron user profile if no longer needed');
  console.log('');
}

transferPodsToNewRon();
