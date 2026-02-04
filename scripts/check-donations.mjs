import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking donations...\n');

// Get all donations from pending_donations table
const { data: donations, error } = await supabase
  .from('pending_donations')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(10);

if (error) {
  console.error('❌ Error fetching donations:', error);
  process.exit(1);
}

if (!donations || donations.length === 0) {
  console.log('No donations found.');
  process.exit(0);
}

console.log(`Found ${donations.length} recent donation(s):\n`);

donations.forEach((donation, index) => {
  console.log(`${index + 1}. Donation ${donation.id}`);
  console.log(`   Status: ${donation.status}`);
  console.log(`   User Wallet: ${donation.user_wallet}`);
  console.log(`   Fiat Amount: $${donation.fiat_amount}`);
  console.log(`   System Tokens to Mint: ${donation.system_tokens_to_mint}`);
  console.log(`   Platform Fee (7.5%): $${donation.org_fee}`);
  console.log(`   Stripe Fee: $${donation.mercury_fee}`);
  console.log(`   Payment Method: ${donation.payment_method || 'pending'}`);
  console.log(`   Stripe Payment ID: ${donation.mercury_payment_id}`);
  console.log(`   Settlement Days: ${donation.settlement_days}`);
  console.log(`   Settlement Date: ${donation.settlement_date || 'Not set'}`);
  console.log(`   Is Reversible: ${donation.is_reversible}`);
  console.log(`   Donor Email: ${donation.donor_email || 'anonymous'}`);
  console.log(`   Created: ${new Date(donation.created_at).toLocaleString()}`);
  console.log(`   Confirmed: ${donation.mercury_confirmed_at ? new Date(donation.mercury_confirmed_at).toLocaleString() : 'Not confirmed'}`);
  console.log(`   Minted: ${donation.minted_at ? new Date(donation.minted_at).toLocaleString() : 'Not minted'}`);

  if (donation.disputed_at) {
    console.log(`   ⚠️ DISPUTED: ${donation.dispute_reason}`);
  }

  if (donation.failure_reason) {
    console.log(`   ❌ FAILED: ${donation.failure_reason}`);
  }

  console.log('');
});

// Show status breakdown
const statusCounts = donations.reduce((acc, d) => {
  acc[d.status] = (acc[d.status] || 0) + 1;
  return acc;
}, {});

console.log('\n📊 Status Breakdown:');
Object.entries(statusCounts).forEach(([status, count]) => {
  console.log(`   ${status}: ${count}`);
});
