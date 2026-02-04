import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkStatus() {
  console.log('Checking proposal and artifact status...\n');

  // Check proposals by status
  const { data: proposals, error: propError } = await supabase
    .from('agent_proposals')
    .select('id, title, status, category, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (propError) {
    console.error('❌ Error fetching proposals:', propError);
    return;
  }

  if (!proposals || proposals.length === 0) {
    console.log('❌ No proposals found in database');
    return;
  }

  // Count by status
  const statusCounts: Record<string, number> = {};
  proposals.forEach(p => {
    statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
  });

  console.log('📊 Proposal Status Breakdown:');
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`   ${status}: ${count}`);
  });

  console.log('\n📋 All Recent Proposals:');
  proposals.forEach((p, i) => {
    console.log(`   ${i + 1}. [${p.status}] ${p.title.substring(0, 60)}`);
  });

  // Check artifacts
  const { data: artifacts, error: artError } = await supabase
    .from('agent_artifacts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (artError) {
    console.error('\n❌ Error fetching artifacts:', artError);
    return;
  }

  console.log('\n🎨 Recent Artifacts:');
  if (!artifacts || artifacts.length === 0) {
    console.log('   None found');
  } else {
    artifacts.forEach((a, i) => {
      console.log(`   ${i + 1}. ${a.title} (${a.artifact_type})`);
    });
  }
}

checkStatus()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
