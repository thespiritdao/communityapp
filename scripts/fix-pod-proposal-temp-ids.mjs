/**
 * Fix temporary IDs in pod_level_proposals table
 *
 * This script updates pod_level_proposals.onchain_proposal_id from temp IDs
 * to the real blockchain IDs by matching with proposal_metadata table.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixTempIds() {
  console.log('🔧 Starting to fix temporary IDs in pod_level_proposals...\n');

  // Get all pod-level proposals with temp IDs
  const { data: podProposals, error: fetchError } = await supabase
    .from('pod_level_proposals')
    .select('id, title, onchain_proposal_id')
    .like('onchain_proposal_id', 'temp_%');

  if (fetchError) {
    console.error('❌ Error fetching pod proposals:', fetchError);
    return;
  }

  if (!podProposals || podProposals.length === 0) {
    console.log('✅ No proposals with temp IDs found - all good!');
    return;
  }

  console.log(`📋 Found ${podProposals.length} proposals with temp IDs:\n`);

  for (const podProposal of podProposals) {
    console.log(`  Processing: "${podProposal.title}"`);
    console.log(`    Current temp ID: ${podProposal.onchain_proposal_id}`);

    // Find the real ID from proposal_metadata
    const { data: metadata, error: metadataError } = await supabase
      .from('proposal_metadata')
      .select('onchain_proposal_id, title')
      .eq('title', podProposal.title)
      .not('onchain_proposal_id', 'like', 'temp_%')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (metadataError || !metadata) {
      console.log(`    ⚠️ Could not find real ID in proposal_metadata`);
      console.log(`    Skipping...\n`);
      continue;
    }

    console.log(`    Real ID found: ${metadata.onchain_proposal_id}`);

    // Update the pod_level_proposals table
    const { error: updateError } = await supabase
      .from('pod_level_proposals')
      .update({ onchain_proposal_id: metadata.onchain_proposal_id })
      .eq('id', podProposal.id);

    if (updateError) {
      console.log(`    ❌ Failed to update:`, updateError.message);
    } else {
      console.log(`    ✅ Updated successfully!`);
    }
    console.log('');
  }

  console.log('🎉 Migration complete!');
}

fixTempIds().catch(console.error);
