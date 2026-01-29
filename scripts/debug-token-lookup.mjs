/**
 * Debug Token Lookup
 *
 * Checks what data exists for the token requirements
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TOKEN_ID = '0x000000880001000b000000000000000000000000000000000000000000000000';
const POD_ID = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';

async function main() {
  console.log('🔍 Debugging Token Lookup\n');
  console.log('Token ID:', TOKEN_ID);
  console.log('Pod ID:', POD_ID);
  console.log('');

  // Check pods table
  console.log('📋 Checking pods table...');
  const { data: podsData, error: podsError } = await supabase
    .from('pods')
    .select('*')
    .eq('id', POD_ID);

  if (podsError) {
    console.error('❌ Error querying pods:', podsError);
  } else {
    console.log('✅ Found pod:', podsData);
    if (podsData.length > 0) {
      const pod = podsData[0];
      console.log('   - Name:', pod.name);
      console.log('   - Hat ID:', pod.hat_id);
      console.log('   - Contract Address:', pod.contract_address);
      console.log('   - Image URL:', pod.pod_image_url);
    }
  }
  console.log('');

  // Check pod_role_permissions table
  console.log('📋 Checking pod_role_permissions table...');
  const { data: rolesData, error: rolesError } = await supabase
    .from('pod_role_permissions')
    .select(`
      *,
      pods (
        name,
        pod_image_url
      )
    `)
    .eq('pod_id', POD_ID);

  if (rolesError) {
    console.error('❌ Error querying roles:', rolesError);
  } else {
    console.log('✅ Found roles:', rolesData?.length || 0);
    rolesData?.forEach((role) => {
      console.log('   - Role:', role.role_name);
      console.log('     Hat ID:', role.role_hat_id);
      console.log('     Pod Name:', role.pods?.name);
      console.log('');
    });
  }
  console.log('');

  // Check if token ID matches any hat IDs
  console.log('🔍 Checking if token ID matches any hat IDs...');

  // Check pods
  const { data: podMatch, error: podMatchError } = await supabase
    .from('pods')
    .select('*')
    .eq('hat_id', TOKEN_ID)
    .maybeSingle();

  if (podMatch) {
    console.log('✅ Token matches pod hat_id:', podMatch.name);
  } else {
    console.log('❌ No pod match for token ID');
  }

  // Check roles
  const { data: roleMatch, error: roleMatchError } = await supabase
    .from('pod_role_permissions')
    .select(`
      *,
      pods (
        name,
        pod_image_url
      )
    `)
    .eq('role_hat_id', TOKEN_ID)
    .maybeSingle();

  if (roleMatch) {
    console.log('✅ Token matches role hat_id:', roleMatch.role_name, 'in pod', roleMatch.pods?.name);
  } else {
    console.log('❌ No role match for token ID');
  }
}

main().catch(console.error);
