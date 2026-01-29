/**
 * Verify Invite Code
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const INVITE_CODE = 'Q93AXD';

async function main() {
  console.log('🔍 Verifying Invite Code:', INVITE_CODE);
  console.log('');

  // Check if code exists
  const { data, error } = await supabase
    .from('user_profiles')
    .select('wallet_address, referral_key, first_name, last_name, invited_by, onboarded_at')
    .eq('referral_key', INVITE_CODE)
    .maybeSingle();

  if (error) {
    console.error('❌ Error querying database:', error);
    return;
  }

  if (!data) {
    console.log('❌ Invite code NOT FOUND in database');
    console.log('');
    console.log('Ron Rivers account needs to have referral_key set to Q93AXD');
    return;
  }

  console.log('✅ Invite code FOUND!');
  console.log('');
  console.log('Owner:', data.first_name, data.last_name);
  console.log('Wallet:', data.wallet_address);
  console.log('Code:', data.referral_key);
  console.log('Invited by:', data.invited_by || 'None (founder)');
  console.log('Onboarded:', data.onboarded_at || 'Not yet');
  console.log('');

  // Check how many people have used this code
  const { data: usageData, error: usageError } = await supabase
    .from('referral_validations')
    .select('*')
    .eq('invite_code', INVITE_CODE);

  if (usageError) {
    console.error('❌ Error querying referral validations:', usageError);
  } else {
    console.log(`📊 Usage count: ${usageData?.length || 0} people have used this code`);
    if (usageData && usageData.length > 0) {
      console.log('');
      console.log('Users who used this code:');
      usageData.forEach((usage, i) => {
        console.log(`  ${i + 1}. ${usage.used_by_wallet}`);
      });
    }
  }
}

main().catch(console.error);
