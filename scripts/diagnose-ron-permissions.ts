// Quick diagnostic script to check Ron's permissions
// Run: npx tsx scripts/diagnose-ron-permissions.ts

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RON_WALLET = '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48';
const EXEC_POD_LEADER_HAT = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function diagnose() {
  console.log('🔍 Diagnosing Ron\'s Permissions\n');
  console.log('Wallet:', RON_WALLET);
  console.log('Expected Executive HAT:', EXEC_POD_LEADER_HAT);
  console.log('─'.repeat(80));

  // 1. Check active_pod_members
  console.log('\n1️⃣ Checking active_pod_members table:');
  const { data: podMembers, error: membersError } = await supabase
    .from('active_pod_members')
    .select('*')
    .eq('wallet', RON_WALLET.toLowerCase())
    .eq('is_active', true);

  if (membersError) {
    console.error('❌ Error:', membersError);
  } else if (!podMembers || podMembers.length === 0) {
    console.error('❌ NO RECORDS FOUND - Ron is not in active_pod_members!');
  } else {
    console.log(`✅ Found ${podMembers.length} active memberships:`);
    podMembers.forEach((m, i) => {
      console.log(`\n   [${i + 1}] Pod: ${m.pod_name}`);
      console.log(`       Type: ${m.membership_type}`);
      console.log(`       HAT ID: ${m.hat_id}`);
      console.log(`       Is Executive: ${m.pod_name?.toLowerCase().includes('executive')}`);
    });
  }

  // 2. Check Executive Pod specifically
  console.log('\n\n2️⃣ Checking Executive Pod membership:');
  const { data: execMembership, error: execError } = await supabase
    .from('active_pod_members')
    .select('*')
    .eq('wallet', RON_WALLET.toLowerCase())
    .ilike('pod_name', '%executive%')
    .eq('is_active', true);

  if (execError) {
    console.error('❌ Error:', execError);
  } else if (!execMembership || execMembership.length === 0) {
    console.error('❌ Ron is NOT in Executive Pod in active_pod_members');
  } else {
    console.log('✅ Executive Pod membership found:');
    execMembership.forEach(m => {
      console.log(`   Pod: ${m.pod_name}`);
      console.log(`   Type: ${m.membership_type}`);
      console.log(`   HAT ID: ${m.hat_id}`);
      console.log(`   Matches env var: ${m.hat_id === EXEC_POD_LEADER_HAT}`);
    });
  }

  // 3. Check pod_role_permissions
  console.log('\n\n3️⃣ Checking pod_role_permissions table:');
  const { data: roles, error: rolesError } = await supabase
    .from('pod_role_permissions')
    .select('*')
    .eq('is_active', true);

  if (rolesError) {
    console.error('❌ Error:', rolesError);
  } else {
    console.log(`Found ${roles?.length || 0} active role permissions`);

    // Find Executive Pod permissions
    const execRoles = roles?.filter(r =>
      r.role_name?.toLowerCase().includes('executive')
    );

    if (execRoles && execRoles.length > 0) {
      console.log(`\n   Executive Pod roles:`);
      execRoles.forEach(r => {
        console.log(`     - ${r.role_name}`);
        console.log(`       token_address: ${r.token_address}`);
        console.log(`       pod_id: ${r.pod_id}`);
      });
    } else {
      console.warn('⚠️ No Executive Pod roles found in pod_role_permissions');
    }
  }

  // 4. Check Executive Pod in pods table
  console.log('\n\n4️⃣ Checking Executive Pod in pods table:');
  const { data: execPod, error: podError } = await supabase
    .from('pods')
    .select('*')
    .ilike('name', '%executive%')
    .single();

  if (podError) {
    console.error('❌ Error:', podError);
  } else {
    console.log('✅ Executive Pod found:');
    console.log(`   ID: ${execPod.id}`);
    console.log(`   Name: ${execPod.name}`);
    console.log(`   Management HAT: ${execPod.management_hat_id}`);
    console.log(`   Membership HAT: ${execPod.membership_hat_id}`);
    console.log(`   Pod Leads: ${JSON.stringify(execPod.pod_leads)}`);

    // Check if Ron is in pod_leads
    const isInLeads = execPod.pod_leads?.some((lead: string) =>
      lead.toLowerCase() === RON_WALLET.toLowerCase()
    );
    console.log(`   Ron in pod_leads: ${isInLeads ? '✅ YES' : '❌ NO'}`);
  }

  // 5. Summary and Recommendations
  console.log('\n\n📊 SUMMARY & RECOMMENDATIONS:');
  console.log('─'.repeat(80));

  const hasActivePodMembers = podMembers && podMembers.length > 0;
  const hasExecMembership = execMembership && execMembership.length > 0;
  const hasExecRole = execMembership?.some(m => m.membership_type === 'leader');

  if (!hasActivePodMembers) {
    console.error('\n❌ CRITICAL: Ron has NO records in active_pod_members');
    console.log('   FIX: Run add-executive-pod-member.ts script');
  }

  if (!hasExecMembership) {
    console.error('\n❌ CRITICAL: Ron is NOT in Executive Pod in active_pod_members');
    console.log('   FIX: Run add-executive-pod-member.ts script with Ron\'s wallet');
  }

  if (hasExecMembership && !hasExecRole) {
    console.error('\n❌ WARNING: Ron is in Executive Pod but NOT as leader');
    console.log('   FIX: Update membership_type to "leader"');
  }

  if (EXEC_POD_LEADER_HAT && hasExecMembership) {
    const hatMatches = execMembership?.some(m => m.hat_id === EXEC_POD_LEADER_HAT);
    if (!hatMatches) {
      console.error('\n❌ WARNING: Ron\'s HAT ID doesn\'t match NEXT_PUBLIC_EXECUTIVE_POD_LEADER');
      console.log(`   Expected: ${EXEC_POD_LEADER_HAT}`);
      console.log(`   Actual: ${execMembership?.[0]?.hat_id}`);
    } else {
      console.log('\n✅ HAT ID matches environment variable');
    }
  }
}

diagnose().catch(console.error);
