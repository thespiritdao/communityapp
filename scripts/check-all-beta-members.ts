import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkAllBetaMembers() {
  const BETA_POD_ID = 'af4cc4d1-e4e1-4ae3-b70e-19f89a07e0cb';

  console.log('🔍 Checking ALL Beta Testers Pod members...\n');

  // Check active_pod_members view
  const { data: activeMembers, error: activeError } = await supabase
    .from('active_pod_members')
    .select('*')
    .eq('pod_id', BETA_POD_ID)
    .eq('is_active', true);

  console.log('📊 Active members count:', activeMembers?.length || 0);
  console.log('');

  if (activeMembers && activeMembers.length > 0) {
    activeMembers.forEach((m, i) => {
      console.log(`${i + 1}. ${m.wallet}`);
      console.log(`   Type: ${m.membership_type}`);
      console.log(`   Pod: ${m.pod_name}`);
      console.log(`   HAT: ${m.hat_id}`);
      console.log('');
    });
  } else {
    console.log('❌ NO MEMBERS FOUND!');
  }

  if (activeError) {
    console.error('❌ Error loading members:', activeError);
  }

  // Also check the pods table to see what members are expected
  const { data: podData, error: podError } = await supabase
    .from('pods')
    .select('id, name, pod_leads, member_hat_id, management_hat_id')
    .eq('id', BETA_POD_ID)
    .single();

  if (podData) {
    console.log('\n📋 Pod configuration:');
    console.log('Name:', podData.name);
    console.log('Pod Leads:', podData.pod_leads);
    console.log('Member HAT:', podData.member_hat_id);
    console.log('Management HAT:', podData.management_hat_id);
  }
}

checkAllBetaMembers();
