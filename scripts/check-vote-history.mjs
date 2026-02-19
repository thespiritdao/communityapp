import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Checking Database for Historical Votes\n');
console.log('='.repeat(70) + '\n');

const { data: votes, error } = await supabase
  .from('governance_votes')
  .select('*')
  .order('timestamp', { ascending: false })
  .limit(10);

if (error) {
  console.error('Error:', error.message);
} else if (!votes || votes.length === 0) {
  console.log('❌ No votes found in pod_votes table');
} else {
  console.log('✅ Found', votes.length, 'recent votes:\n');

  votes.forEach((vote, i) => {
    console.log(`Vote ${i + 1}:`);
    console.log('  Voter:', vote.voter_address);
    console.log('  Vote:', vote.vote);
    console.log('  Timestamp:', vote.timestamp);
    console.log('  Proposal:', vote.proposal_id);
    console.log('  Signature:', vote.signature ? 'Has sig' : 'No sig (gasless)');
    console.log('');
  });
}
