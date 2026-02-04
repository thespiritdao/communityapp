import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking donation approval status...\n');

// Get the donation
const { data: donation, error: donationError } = await supabase
  .from('pending_donations')
  .select('*')
  .eq('id', 'f759c236-7c30-4b75-b141-fde0a1159f2f')
  .single();

if (donationError) {
  console.error('❌ Error fetching donation:', donationError);
  process.exit(1);
}

console.log('📋 DONATION:');
console.log(`   ID: ${donation.id}`);
console.log(`   Status: ${donation.status}`);
console.log(`   Amount: $${donation.fiat_amount}`);
console.log(`   Tokens to Mint: ${donation.system_tokens_to_mint}`);
console.log(`   User Wallet: ${donation.user_wallet}`);
console.log('');

// Get approvals
const { data: approvals, error: approvalsError } = await supabase
  .from('donation_approvals')
  .select('*')
  .eq('donation_id', 'f759c236-7c30-4b75-b141-fde0a1159f2f')
  .order('approved_at', { ascending: true });

if (approvalsError) {
  console.error('❌ Error fetching approvals:', approvalsError);
  process.exit(1);
}

console.log(`✅ APPROVALS (${approvals.length}/2):`);
if (approvals.length === 0) {
  console.log('   No approvals yet');
} else {
  approvals.forEach((approval, index) => {
    console.log(`   ${index + 1}. ${approval.approver_wallet}`);
    console.log(`      Approved at: ${new Date(approval.approved_at).toLocaleString()}`);
    console.log(`      HAT ID: ${approval.approver_hat_id}`);
    console.log('');
  });
}

console.log('\n📊 SUMMARY:');
console.log(`   Approvals: ${approvals.length}/2`);
console.log(`   Threshold Met: ${approvals.length >= 2 ? 'YES ✅' : 'NO ❌'}`);
console.log(`   Current Status: ${donation.status}`);

if (approvals.length === 1) {
  console.log('\n🎯 NEXT STEP:');
  console.log('   Need 1 more approval to trigger minting');
  console.log('   For beta testing, you can manually update to pending_mint status');
}
