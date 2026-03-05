/**
 * Fix Temporal Naturalism pod hat IDs from decimal to hex format
 * (matching the Executive Pod convention of 0x-prefixed hex strings)
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TN_POD_ID = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';

// Converted from decimal to hex (64-char padded, 0x-prefixed)
const MANAGEMENT_HAT_HEX = '0x000000880001000b000200000000000000000000000000000000000000000000';
const MEMBERSHIP_HAT_HEX  = '0x000000880001000b000200120000000000000000000000000000000000000000';

async function main() {
  console.log('📋 Fetching current TN pod record...');
  const { data: pod, error: fetchErr } = await supabase
    .from('pods')
    .select('id, name, management_hat_id, membership_hat_id')
    .eq('id', TN_POD_ID)
    .single();

  if (fetchErr) {
    console.error('❌ Failed to fetch pod:', fetchErr);
    process.exit(1);
  }

  console.log('Current values:');
  console.log('  management_hat_id:', pod.management_hat_id);
  console.log('  membership_hat_id:', pod.membership_hat_id);

  console.log('\nUpdating to hex format...');
  const { error: updateErr } = await supabase
    .from('pods')
    .update({
      management_hat_id: MANAGEMENT_HAT_HEX,
      membership_hat_id: MEMBERSHIP_HAT_HEX,
    })
    .eq('id', TN_POD_ID);

  if (updateErr) {
    console.error('❌ Failed to update pod:', updateErr);
    process.exit(1);
  }

  console.log('\n✅ Updated hat IDs to hex format:');
  console.log('  management_hat_id:', MANAGEMENT_HAT_HEX);
  console.log('  membership_hat_id:', MEMBERSHIP_HAT_HEX);
}

main();
