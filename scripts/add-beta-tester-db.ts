// scripts/add-beta-tester-db.ts
// Add user to beta_testers table in Supabase (bypasses HAT minting)
// Wallet: 0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as path from 'path';

// Load environment variables from .env
config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const EXEC_POD_HOLDER = '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48';

async function main() {
  console.log('📝 Adding Exec Pod Holder to Beta Testers');
  console.log('==========================================');
  console.log('Wallet:', EXEC_POD_HOLDER);
  console.log('');

  try {
    // 1. Check if already in beta_testers table
    console.log('1. Checking if user is already a beta tester...');
    const { data: existing, error: checkError } = await supabase
      .from('beta_testers')
      .select('*')
      .eq('wallet_address', EXEC_POD_HOLDER.toLowerCase())
      .maybeSingle();

    if (checkError) {
      console.error('❌ Error checking beta testers:', checkError);
      throw checkError;
    }

    if (existing) {
      console.log('✅ User is already a beta tester!');
      console.log('   ID:', existing.id);
      console.log('   Added at:', existing.created_at);
      console.log('');
      console.log('User should now have access to pod management.');
      return;
    }

    console.log('   User not found in beta_testers table');
    console.log('');

    // 2. Add to beta_testers table
    console.log('2. Adding user to beta_testers table...');
    const { data: inserted, error: insertError } = await supabase
      .from('beta_testers')
      .insert([
        {
          wallet_address: EXEC_POD_HOLDER.toLowerCase(),
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error inserting beta tester:', insertError);
      throw insertError;
    }

    console.log('✅ Successfully added to beta_testers table!');
    console.log('   ID:', inserted.id);
    console.log('   Wallet:', inserted.wallet_address);
    console.log('   Created at:', inserted.created_at);
    console.log('');

    // 3. Verify access
    console.log('3. Verifying beta tester access...');
    const { data: verified, error: verifyError } = await supabase
      .from('beta_testers')
      .select('*')
      .eq('wallet_address', EXEC_POD_HOLDER.toLowerCase())
      .single();

    if (verifyError) {
      console.error('❌ Error verifying:', verifyError);
      throw verifyError;
    }

    console.log('✅ Verified! User is now a beta tester.');
    console.log('');
    console.log('🎉 SUCCESS!');
    console.log('');
    console.log('Next steps:');
    console.log('1. User should refresh the page at spiritdao.org/pods');
    console.log('2. Exec Pod management panel should now be visible');
    console.log('3. User can manage pod settings and members');

  } catch (error: any) {
    console.error('❌ Script failed:');
    console.error(error);
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log('');
    console.log('Script completed successfully ✓');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
