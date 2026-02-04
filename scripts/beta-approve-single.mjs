import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🧪 BETA MODE: Bypassing 2-of-3 approval for testing...\n');

const donationId = 'f759c236-7c30-4b75-b141-fde0a1159f2f';

// Check current status
const { data: donation } = await supabase
  .from('pending_donations')
  .select('*')
  .eq('id', donationId)
  .single();

console.log('📋 Current Status:', donation.status);

// Check approvals
const { data: approvals } = await supabase
  .from('donation_approvals')
  .select('*')
  .eq('donation_id', donationId);

console.log(`✅ Approvals: ${approvals.length}/2\n`);

if (approvals.length === 0) {
  console.error('❌ No approvals found. Please approve first via the dashboard.');
  process.exit(1);
}

// Update to pending_mint to trigger minting
console.log('🔄 Updating status to pending_mint...');

const { error: updateError } = await supabase
  .from('pending_donations')
  .update({
    status: 'pending_mint'
    // Note: approved_at column will be added in future migration
  })
  .eq('id', donationId);

if (updateError) {
  console.error('❌ Failed to update status:', updateError);
  process.exit(1);
}

console.log('✅ Status updated to pending_mint\n');

// Trigger minting service
console.log('🪙 Triggering minting service...');

try {
  const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/donations/mint`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    },
    body: JSON.stringify({ donationId })
  });

  const data = await response.json();

  if (response.ok) {
    console.log('✅ Minting triggered successfully!');
    console.log('\n📊 Response:', JSON.stringify(data, null, 2));
  } else {
    console.error('❌ Minting failed:', data);
    console.log('\n⚠️  Check Vercel function logs for details');
    console.log('   Look for: "💼 MINTING WALLET ADDRESS"');
    console.log('   That wallet needs EXECUTIVE_ROLE on SystemToken contract');
  }
} catch (error) {
  console.error('❌ Error calling minting service:', error);
}
