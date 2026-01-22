/**
 * Direct Supabase script to reset treasury to null
 * Bypasses API and RLS policies using service role key
 * Usage: node scripts/direct-reset-treasury.mjs <podId>
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅ Set' : '❌ Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const podId = process.argv[2] || 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';

console.log('🔄 Direct database reset - Removing treasury assignment...');
console.log('Pod ID:', podId);
console.log('');

try {
  // First, check current state
  const { data: currentPod, error: fetchError } = await supabase
    .from('pods')
    .select('id, name, treasury_contract_address, is_active')
    .eq('id', podId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch pod: ${fetchError.message}`);
  }

  if (!currentPod) {
    throw new Error('Pod not found');
  }

  console.log('📋 Current state:');
  console.log('  Pod:', currentPod.name);
  console.log('  Treasury:', currentPod.treasury_contract_address);
  console.log('  Active:', currentPod.is_active);
  console.log('');

  // Update to reset treasury
  const { data: updatedPod, error: updateError } = await supabase
    .from('pods')
    .update({
      treasury_contract_address: null,
      treasury_deployed_at: null,
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', podId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Failed to update pod: ${updateError.message}`);
  }

  console.log('✅ Treasury reset successfully!');
  console.log('');
  console.log('📋 New state:');
  console.log('  Pod:', updatedPod.name);
  console.log('  Treasury:', updatedPod.treasury_contract_address || '(null)');
  console.log('  Active:', updatedPod.is_active);
  console.log('');
  console.log('⚠️  IMPORTANT NOTES:');
  console.log('  • The on-chain treasury contract STILL EXISTS at: 0x1B7a1058f9611680ed48c580BFbD1a84a83F9F71');
  console.log('  • When you click "Deploy Treasury", it will:');
  console.log('    1. Attempt deployment → fail with "already exists"');
  console.log('    2. Trigger automatic recovery flow');
  console.log('    3. Re-link to existing contract');
  console.log('  • For a truly clean deploy, create a new pod instead');
  console.log('');
  console.log('📹 You can now record your tutorial showing the recovery flow!');

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('');
  console.error('Troubleshooting:');
  console.error('  • Check that pod ID is correct');
  console.error('  • Verify Supabase credentials in .env');
  console.error('  • Check Supabase RLS policies (service role should bypass)');
  process.exit(1);
}
