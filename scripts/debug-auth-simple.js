// SIMPLE VERSION - Paste this entire block into browser console
// Make sure you're on the app page and logged in

(async function() {
  console.log('🔍 Debugging Supabase Auth\n');

  // Try to find supabase client in various places
  let supabase = window.supabase;

  if (!supabase) {
    // Try to import it
    try {
      const module = await import('/src/utils/supabaseClient.ts');
      supabase = module.supabase;
    } catch (e) {
      console.error('❌ Could not find supabase client');
      console.log('\nTry this alternative approach:');
      console.log('1. Look at the Network tab in DevTools');
      console.log('2. Find a request to supabase.co/rest/v1/');
      console.log('3. Look at the Authorization header');
      console.log('4. Share that header with me');
      return;
    }
  }

  // Get session
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    console.error('❌ No Supabase Auth session');
    console.log('This means you might be logged in via wallet only, not Supabase Auth');
    return;
  }

  console.log('✅ Supabase Session Found');
  console.log('User ID (auth.uid()):', session.user.id);
  console.log('Email:', session.user.email);

  // Check user_profiles
  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('user_id, wallet_address')
    .eq('user_id', session.user.id)
    .single();

  if (error) {
    console.error('\n❌ user_profiles error:', error);
    if (error.code === 'PGRST116') {
      console.log('\n💡 NO PROFILE EXISTS - Run this SQL:');
      console.log(`INSERT INTO user_profiles (user_id, wallet_address) VALUES ('${session.user.id}', '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48');`);
    }
    return;
  }

  console.log('\n✅ Profile found');
  console.log('wallet_address:', profile.wallet_address);

  if (!profile.wallet_address) {
    console.log('\n💡 wallet_address is NULL - Run this SQL:');
    console.log(`UPDATE user_profiles SET wallet_address = '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48' WHERE user_id = '${session.user.id}';`);
  }
})();
