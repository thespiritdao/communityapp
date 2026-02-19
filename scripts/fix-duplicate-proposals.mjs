import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔧 Fixing Duplicate Proposals\n');
console.log('='.repeat(70) + '\n');

// 1. Find pod-level proposals with temp IDs
const { data: tempProposals } = await supabase
  .from('pod_level_proposals')
  .select('*')
  .like('onchain_proposal_id', 'temp_%')
  .order('created_at', { ascending: false });

console.log(`📋 Found ${tempProposals?.length || 0} pod-level proposals with temp IDs\n`);

if (!tempProposals || tempProposals.length === 0) {
  console.log('✅ No duplicate proposals to fix!');
  process.exit(0);
}

// 2. For each temp proposal, try to find its real on-chain ID
for (const proposal of tempProposals) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Processing: ${proposal.title || 'Untitled'}`);
  console.log(`Temp ID: ${proposal.onchain_proposal_id}`);
  console.log(`Created: ${proposal.created_at}`);

  // Look for matching proposal in proposal_metadata with same title and created_at
  const { data: metadataProposal } = await supabase
    .from('proposal_metadata')
    .select('*')
    .eq('title', proposal.title)
    .single();

  if (metadataProposal && metadataProposal.onchain_proposal_id && !metadataProposal.onchain_proposal_id.startsWith('temp_')) {
    console.log(`\n✅ Found matching governance proposal!`);
    console.log(`   Real ID: ${metadataProposal.onchain_proposal_id}`);
    console.log(`   Transaction: ${metadataProposal.transaction_hash || 'N/A'}`);

    // Update the pod-level proposal with real ID
    const { error } = await supabase
      .from('pod_level_proposals')
      .update({
        onchain_proposal_id: metadataProposal.onchain_proposal_id,
        transaction_hash: metadataProposal.transaction_hash,
      })
      .eq('id', proposal.id);

    if (error) {
      console.log(`   ❌ Failed to update: ${error.message}`);
    } else {
      console.log(`   ✅ Updated pod-level proposal with real on-chain ID`);
    }
  } else {
    console.log(`   ⚠️ No matching governance proposal found`);
    console.log(`   This proposal will remain with temp ID`);
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log('\n🎯 Summary:\n');

// 3. Re-check how many temp proposals remain
const { data: remainingTemp } = await supabase
  .from('pod_level_proposals')
  .select('id')
  .like('onchain_proposal_id', 'temp_%');

console.log(`   Pod-level proposals with temp IDs: ${remainingTemp?.length || 0}`);

// 4. Check if deduplication will now work
const { data: podProposals } = await supabase
  .from('pod_level_proposals')
  .select('id, onchain_proposal_id')
  .not('onchain_proposal_id', 'like', 'temp_%');

const podOnchainIds = new Set(podProposals?.map(p => p.onchain_proposal_id) || []);

const { data: govProposals } = await supabase
  .from('proposal_metadata')
  .select('onchain_proposal_id');

const duplicates = govProposals?.filter(p => podOnchainIds.has(p.onchain_proposal_id)) || [];

console.log(`   Governance proposals that will be deduplicated: ${duplicates.length}`);
console.log('');

if (duplicates.length > 0) {
  console.log('✅ Deduplication will now work! These duplicates will be hidden:');
  duplicates.forEach(d => {
    console.log(`   - ${d.onchain_proposal_id}`);
  });
} else {
  console.log('ℹ️ No duplicates to deduplicate (this is OK)');
}
