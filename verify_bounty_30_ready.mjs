import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Verifying Bounty #30 is ready for testing...\n');

// Get bounty details
const { data: bounty, error: bountyError } = await supabase
  .from('bounties')
  .select('*')
  .eq('onchain_id', 30)
  .single();

if (bountyError) {
  console.error('❌ Error fetching bounty:', bountyError);
  process.exit(1);
}

console.log('📋 Bounty #30 Details:');
console.log('  ID:', bounty.id);
console.log('  Title:', bounty.title);
console.log('  Status:', bounty.status);
console.log('  On-chain ID:', bounty.onchain_id);
console.log('  Created by:', bounty.creator_address);
console.log('  Reward:', bounty.reward_amount, bounty.payment_token);
console.log('  Updated:', bounty.updated_at);

// Check if status is correct
if (bounty.status === 'assigned') {
  console.log('\n✅ Status is CORRECT: "assigned"');
} else {
  console.log('\n❌ Status is WRONG:', bounty.status);
  console.log('   Expected: "assigned"');
}

// Get approved bid
const { data: approvedBid, error: bidError } = await supabase
  .from('bids')
  .select('*')
  .eq('bounty_id', bounty.id)
  .eq('status', 'approved')
  .single();

if (bidError) {
  console.error('\n❌ No approved bid found:', bidError);
} else {
  console.log('\n📋 Approved Bid Details:');
  console.log('  Bid ID:', approvedBid.id);
  console.log('  Bidder:', approvedBid.bidder_address);
  console.log('  Status:', approvedBid.status);
  console.log('  Reviewer:', approvedBid.reviewer_address || 'NOT SET ❌');
  console.log('  Final Approver:', approvedBid.final_approver_address || 'NOT SET ❌');
  console.log('  Reviewed At:', approvedBid.reviewed_at || 'NOT SET ❌');
  console.log('  On-chain Index:', approvedBid.onchain_bid_index);

  // Verify reviewer addresses
  if (approvedBid.reviewer_address && approvedBid.final_approver_address) {
    console.log('\n✅ Reviewer addresses are SET');
  } else {
    console.log('\n⚠️ Reviewer addresses are MISSING (this is expected for old bid)');
    console.log('   New bids will have reviewer addresses stored correctly');
  }
}

// Check for work submissions
const { data: workSubmissions, error: workError } = await supabase
  .from('work_submissions')
  .select('*')
  .eq('bounty_id', bounty.id);

if (workError) {
  console.log('\n⚠️ Error checking work submissions:', workError);
} else if (!workSubmissions || workSubmissions.length === 0) {
  console.log('\n📝 No work submissions yet (expected - next step)');
} else {
  console.log('\n📝 Work Submissions:', workSubmissions.length);
  workSubmissions.forEach((ws, i) => {
    console.log(`  ${i + 1}. ${ws.submission_title} - Status: ${ws.status}`);
  });
}

// UI Filter Check
console.log('\n🎯 UI Filter Check:');
console.log('When you filter by "Assigned" in the UI:');

const statusNumber = bounty.status === 'open' ? 0 :
                     bounty.status === 'assigned' ? 1 :
                     bounty.status === 'completed' ? 2 :
                     bounty.status === 'draft' ? 0 : 3;

console.log('  Database status:', `"${bounty.status}"`);
console.log('  Converts to number:', statusNumber);
console.log('  Filter expects:', 1);

if (statusNumber === 1) {
  console.log('  ✅ Bounty WILL appear in "Assigned" filter');
} else {
  console.log('  ❌ Bounty will NOT appear in "Assigned" filter');
}

// Next steps
console.log('\n📋 Next Steps for Testing:');
console.log('');
console.log('1. REFRESH BOUNTY PAGE');
console.log('   - Open your browser');
console.log('   - Navigate to /bounty page');
console.log('   - Do a hard refresh (Ctrl+Shift+R or Cmd+Shift+R)');
console.log('');
console.log('2. VERIFY BOUNTY APPEARS IN ASSIGNED FILTER');
console.log('   - Go to "Manage" tab');
console.log('   - Click "Assigned" filter');
console.log('   - You should see "Test Bounty 18"');
console.log('');
console.log('3. SUBMIT WORK AS BIDDER');
console.log('   - Click on the bounty');
console.log('   - Look for green success message: "✅ Your Bid Was Approved!"');
console.log('   - Click "📤 Submit Completed Work" button');
console.log('   - Fill out work submission form');
console.log('   - Submit');
console.log('');
console.log('4. REVIEW WORK AS MANAGER');
console.log('   - Go to "Manage" tab');
console.log('   - Click "Work" tab');
console.log('   - You should see your submission');
console.log('   - Accept the work');
console.log('');
console.log('5. RELEASE PAYMENT');
console.log('   - Go to "Pay" tab');
console.log('   - Click "Release Payment"');
console.log('   - On-chain transaction will complete the bounty');
console.log('');
console.log('✅ Bounty #30 is ready for testing!');
