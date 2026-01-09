// Check if Ron is properly set up in Beta Testers Pod
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const RON_WALLET = '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function check() {
  console.log('🔍 Checking Ron\'s Beta Tester Pod Membership\n');

  // Check all pod memberships
  const { data: allMemberships } = await supabase
    .from('active_pod_members')
    .select('*')
    .eq('wallet', RON_WALLET.toLowerCase())
    .eq('is_active', true);

  console.log(`Total active memberships: ${allMemberships?.length || 0}\n`);

  allMemberships?.forEach((m, i) => {
    console.log(`${i + 1}. ${m.pod_name}`);
    console.log(`   Type: ${m.membership_type}`);
    console.log(`   HAT: ${m.hat_id}`);
  });

  // Check Beta Testers Pod specifically
  console.log('\n\n📋 Beta Testers Pod Check:');
  const { data: betaPod } = await supabase
    .from('pods')
    .select('*')
    .ilike('name', '%beta%tester%')
    .single();

  if (betaPod) {
    console.log(`Pod: ${betaPod.name}`);
    console.log(`ID: ${betaPod.id}`);
    console.log(`Management HAT: ${betaPod.management_hat_id}`);
    console.log(`Pod Leads: ${JSON.stringify(betaPod.pod_leads)}`);

    const isInLeads = betaPod.pod_leads?.some((lead: string) =>
      lead.toLowerCase() === RON_WALLET.toLowerCase()
    );
    console.log(`Ron in pod_leads: ${isInLeads ? '✅' : '❌'}`);
  }

  // Check if Ron has Beta Tester membership in active_pod_members
  const betaMembership = allMemberships?.find(m =>
    m.pod_name?.toLowerCase().includes('beta')
  );

  if (betaMembership) {
    console.log('\n✅ Ron HAS Beta Tester membership in active_pod_members');
  } else {
    console.log('\n❌ Ron MISSING from Beta Tester pod in active_pod_members');
    console.log('   Need to add him as a leader');
  }
}

check().catch(console.error);
