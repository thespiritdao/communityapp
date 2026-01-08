/**
 * Script to check and fix Executive Pod HAT configuration
 *
 * This ensures the Executive Pod has the correct management_hat_id and membership_hat_id
 * so that the member indexing service can properly sync members.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from multiple possible locations
const envPaths = [
  path.join(process.cwd(), '.env.local'),
  path.join(process.cwd(), '.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`📄 Loading environment from: ${envPath}`);
    dotenv.config({ path: envPath });
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXECUTIVE_POD_LEADER_HAT = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER;
const EXECUTIVE_POD_MEMBER_HAT = process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER;
const EXECUTIVE_POD_ID = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';

// Validate required environment variables
if (!SUPABASE_URL) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL not found in environment');
  console.error('   Please ensure .env.local or .env file exists with this variable');
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found in environment');
  console.error('   Please ensure .env.local or .env file exists with this variable');
  process.exit(1);
}

if (!EXECUTIVE_POD_LEADER_HAT) {
  console.error('❌ Error: NEXT_PUBLIC_EXECUTIVE_POD_LEADER not found in environment');
  console.error('   Please ensure .env.local or .env file exists with this variable');
  process.exit(1);
}

if (!EXECUTIVE_POD_MEMBER_HAT) {
  console.error('❌ Error: NEXT_PUBLIC_EXECUTIVE_POD_MEMBER not found in environment');
  console.error('   Please ensure .env.local or .env file exists with this variable');
  process.exit(1);
}

async function main() {
  console.log('🔍 Checking Executive Pod HAT configuration...\n');

  // Initialize Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Check current configuration
  const { data: pod, error } = await supabase
    .from('pods')
    .select('id, name, management_hat_id, membership_hat_id')
    .eq('id', EXECUTIVE_POD_ID)
    .single();

  if (error) {
    console.error('❌ Error fetching Executive Pod:', error);
    return;
  }

  if (!pod) {
    console.error('❌ Executive Pod not found in database');
    return;
  }

  console.log('📋 Current Executive Pod configuration:');
  console.log('  Pod ID:', pod.id);
  console.log('  Name:', pod.name);
  console.log('  Management HAT ID:', pod.management_hat_id || '(not set)');
  console.log('  Membership HAT ID:', pod.membership_hat_id || '(not set)');
  console.log();

  console.log('🎩 Expected HAT IDs from environment:');
  console.log('  NEXT_PUBLIC_EXECUTIVE_POD_LEADER:', EXECUTIVE_POD_LEADER_HAT);
  console.log('  NEXT_PUBLIC_EXECUTIVE_POD_MEMBER:', EXECUTIVE_POD_MEMBER_HAT);
  console.log();

  // Check if update is needed
  const needsUpdate =
    pod.management_hat_id !== EXECUTIVE_POD_LEADER_HAT ||
    pod.membership_hat_id !== EXECUTIVE_POD_MEMBER_HAT;

  if (needsUpdate) {
    console.log('⚠️  HAT IDs need to be updated\n');
    console.log('🔧 Updating Executive Pod HAT configuration...');

    const { error: updateError } = await supabase
      .from('pods')
      .update({
        management_hat_id: EXECUTIVE_POD_LEADER_HAT,
        membership_hat_id: EXECUTIVE_POD_MEMBER_HAT,
      })
      .eq('id', EXECUTIVE_POD_ID);

    if (updateError) {
      console.error('❌ Error updating Executive Pod:', updateError);
      return;
    }

    console.log('✅ Executive Pod HAT configuration updated successfully!\n');
  } else {
    console.log('✅ Executive Pod HAT configuration is correct!\n');
  }

  // Verify the update
  const { data: updatedPod } = await supabase
    .from('pods')
    .select('id, name, management_hat_id, membership_hat_id')
    .eq('id', EXECUTIVE_POD_ID)
    .single();

  console.log('📋 Final Executive Pod configuration:');
  console.log('  Management HAT ID:', updatedPod?.management_hat_id);
  console.log('  Membership HAT ID:', updatedPod?.membership_hat_id);
  console.log();
  console.log('🎉 Executive Pod is ready for member indexing!');
  console.log('   Next step: Visit /admin/sync-pod-members to sync members');
}

main().catch(console.error);
