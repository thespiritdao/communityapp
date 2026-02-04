// Cleanup test user created during authentication testing
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const TEST_WALLET = '0x1234567890123456789012345678901234567890';

async function cleanup() {
  console.log(`🧹 Cleaning up test user: ${TEST_WALLET}`);

  // Get user_id from profile
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('user_id')
    .eq('wallet_address', TEST_WALLET)
    .single();

  if (profileError && profileError.code !== 'PGRST116') {
    console.error('Error finding profile:', profileError);
    process.exit(1);
  }

  if (!profile) {
    console.log('✅ No test user found - already clean');
    process.exit(0);
  }

  const userId = profile.user_id;
  console.log(`Found user_id: ${userId}`);

  // Delete from user_profiles
  const { error: deleteProfileError } = await supabase
    .from('user_profiles')
    .delete()
    .eq('wallet_address', TEST_WALLET);

  if (deleteProfileError) {
    console.error('Error deleting profile:', deleteProfileError);
    process.exit(1);
  }

  console.log('✅ Deleted user_profiles entry');

  // Delete from auth.users
  const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(
    userId
  );

  if (deleteAuthError) {
    console.error('Error deleting auth user:', deleteAuthError);
    process.exit(1);
  }

  console.log('✅ Deleted auth.users entry');
  console.log('🎉 Cleanup complete!');
}

cleanup();
