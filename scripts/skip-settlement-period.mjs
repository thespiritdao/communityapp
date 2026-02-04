import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('⏭️  Skipping settlement period for testing...\n');

// Get the most recent donation in awaiting_settlement status
const { data: donation, error: fetchError } = await supabase
  .from('pending_donations')
  .select('*')
  .eq('status', 'awaiting_settlement')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

if (fetchError) {
  if (fetchError.code === 'PGRST116') {
    console.log('❌ No donations found in awaiting_settlement status.');
    process.exit(1);
  }
  console.error('❌ Error fetching donation:', fetchError);
  process.exit(1);
}

console.log('📋 Found donation:');
console.log(`   ID: ${donation.id}`);
console.log(`   User Wallet: ${donation.user_wallet}`);
console.log(`   Amount: $${donation.fiat_amount}`);
console.log(`   Tokens to Mint: ${donation.system_tokens_to_mint}`);
console.log(`   Current Status: ${donation.status}`);
console.log(`   Settlement Date: ${donation.settlement_date}`);
console.log('');

// Update status to awaiting_executive_approval
const { data: updated, error: updateError } = await supabase
  .from('pending_donations')
  .update({
    status: 'awaiting_executive_approval',
    // Keep settlement_date for records, but mark as ready for approval
  })
  .eq('id', donation.id)
  .select()
  .single();

if (updateError) {
  console.error('❌ Error updating donation:', updateError);
  process.exit(1);
}

console.log('✅ SUCCESS! Donation status updated:');
console.log(`   Old Status: awaiting_settlement`);
console.log(`   New Status: ${updated.status}`);
console.log('');
console.log('🎯 Next Steps:');
console.log('   1. Visit https://app.spiritdao.org/executive/donations');
console.log('   2. Connect with an Executive Pod wallet');
console.log('   3. Approve the donation (need 2-of-3 approvals)');
console.log('   4. After 2nd approval, minting will trigger automatically');
console.log('');
console.log(`📝 Donation ID: ${updated.id}`);
