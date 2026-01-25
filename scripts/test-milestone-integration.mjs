/**
 * Test Milestone Integration
 *
 * This script tests the milestone creation flow:
 * 1. Finds a bid with deliverables
 * 2. Checks if milestones were created
 * 3. Verifies bounty payment_type was updated
 *
 * Run: node scripts/test-milestone-integration.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testMilestoneIntegration() {
  console.log('🧪 Testing Milestone Integration\n');

  try {
    // Step 1: Find the most recent bid with deliverables
    console.log('📋 Step 1: Finding bid with deliverables...');
    const { data: bidsWithDeliverables, error: bidsError } = await supabase
      .from('bids')
      .select('*')
      .not('deliverables', 'is', null)
      .limit(5);

    if (bidsError) {
      console.error('❌ Failed to fetch bids:', bidsError);
      return;
    }

    console.log(`✅ Found ${bidsWithDeliverables?.length || 0} bids with deliverables\n`);

    if (!bidsWithDeliverables || bidsWithDeliverables.length === 0) {
      console.log('⚠️ No bids with deliverables found');
      return;
    }

    // Display each bid with deliverables
    for (const bid of bidsWithDeliverables) {
      console.log(`\n📝 Bid ID: ${bid.id}`);
      console.log(`   Bounty ID: ${bid.bounty_id}`);
      console.log(`   Status: ${bid.status}`);

      // Parse deliverables
      let deliverables = [];
      try {
        deliverables = typeof bid.deliverables === 'string'
          ? JSON.parse(bid.deliverables)
          : bid.deliverables;
      } catch (e) {
        console.log(`   ❌ Failed to parse deliverables:`, e.message);
        continue;
      }

      console.log(`   Deliverables count: ${deliverables?.length || 0}`);
      if (deliverables && deliverables.length > 0) {
        deliverables.forEach((d, i) => {
          console.log(`     ${i + 1}. ${d.description} - ${d.payment_amount || '0'}`);
        });
      }

      // Step 2: Check if milestones exist for this bid
      console.log(`\n   🔍 Checking for milestones...`);
      const { data: milestones, error: milestonesError } = await supabase
        .from('milestones')
        .select('*')
        .eq('bid_id', bid.id)
        .order('due_date', { ascending: true });

      if (milestonesError) {
        console.log(`   ❌ Error fetching milestones:`, milestonesError.message);
      } else if (!milestones || milestones.length === 0) {
        console.log(`   ⚠️ No milestones found for this bid`);
      } else {
        console.log(`   ✅ Found ${milestones.length} milestones:`);
        milestones.forEach((m, i) => {
          console.log(`\n     Milestone ${i + 1}:`);
          console.log(`       ID: ${m.id}`);
          console.log(`       Description: ${m.deliverable_description}`);
          console.log(`       Amount: ${m.payment_amount}`);
          console.log(`       Due Date: ${new Date(m.due_date).toLocaleDateString()}`);
          console.log(`       Status: ${m.status}`);
        });
      }

      // Step 3: Check bounty payment_type
      console.log(`\n   🔍 Checking bounty payment_type...`);
      const { data: bounty, error: bountyError } = await supabase
        .from('bounties')
        .select('id, title, payment_type')
        .eq('id', bid.bounty_id)
        .single();

      if (bountyError) {
        console.log(`   ❌ Error fetching bounty:`, bountyError.message);
      } else {
        console.log(`   Bounty: "${bounty.title}"`);
        console.log(`   Payment Type: ${bounty.payment_type || 'null'}`);

        if (milestones && milestones.length > 0) {
          if (bounty.payment_type === 'milestones') {
            console.log(`   ✅ Payment type correctly set to 'milestones'`);
          } else {
            console.log(`   ⚠️ Payment type is '${bounty.payment_type}', expected 'milestones'`);
          }
        }
      }

      console.log('\n   ' + '─'.repeat(60));
    }

    // Summary
    console.log('\n\n📊 Summary:');
    console.log('─'.repeat(60));

    const { count: totalMilestones } = await supabase
      .from('milestones')
      .select('*', { count: 'exact', head: true });

    console.log(`Total milestones in database: ${totalMilestones || 0}`);

    const { data: milestoneBounties, error: mbError } = await supabase
      .from('bounties')
      .select('id, title')
      .eq('payment_type', 'milestones');

    console.log(`Bounties with payment_type='milestones': ${milestoneBounties?.length || 0}`);

    if (milestoneBounties && milestoneBounties.length > 0) {
      console.log('\nMilestone bounties:');
      milestoneBounties.forEach((b) => {
        console.log(`  - ${b.title} (ID: ${b.id})`);
      });
    }

    console.log('\n✅ Test complete');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testMilestoneIntegration();
