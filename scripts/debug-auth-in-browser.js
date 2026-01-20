// DEBUG AUTH IN BROWSER
// Paste this into your browser console while the app is running and you're logged in
// This will show your actual Supabase Auth state when making requests

(async function debugAuth() {
  console.log('🔍 Debugging Supabase Auth State\n');

  // Get the supabase client from the app
  const { supabase } = await import('/src/utils/supabaseClient');

  // Get current session
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('❌ Error getting session:', sessionError);
    return;
  }

  if (!session) {
    console.error('❌ No active Supabase Auth session!');
    console.log('   This is likely the problem - RLS needs a Supabase Auth session');
    console.log('   but you might only be logged in via wallet (CDP)');
    return;
  }

  console.log('✅ Supabase Auth Session Found');
  console.log('   User ID (auth.uid()):', session.user.id);
  console.log('   Email:', session.user.email);
  console.log('   Created:', new Date(session.user.created_at).toLocaleString());

  // Check user_profiles for this auth.uid()
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('user_id, wallet_address, email')
    .eq('user_id', session.user.id)
    .single();

  if (profileError) {
    console.error('\n❌ Error fetching user_profiles:', profileError);
    if (profileError.code === 'PGRST116') {
      console.error('   NO user_profiles entry for this auth.uid()!');
      console.error('   This is why RLS is failing!');
      console.log('\n💡 Solution: Create a user_profiles entry for auth.uid():', session.user.id);
      console.log('   Run this SQL:');
      console.log(`   INSERT INTO user_profiles (user_id, wallet_address, email) VALUES ('${session.user.id}', '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48', '${session.user.email}');`);
    }
    return;
  }

  console.log('\n✅ user_profiles entry found');
  console.log('   wallet_address:', profile.wallet_address);
  console.log('   email:', profile.email);

  if (!profile.wallet_address) {
    console.error('\n❌ wallet_address is NULL!');
    console.error('   This is why RLS is failing!');
    console.log('\n💡 Solution: Update wallet_address');
    console.log('   Run this SQL:');
    console.log(`   UPDATE user_profiles SET wallet_address = '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48' WHERE user_id = '${session.user.id}';`);
    return;
  }

  // Check if wallet matches expected
  const expectedWallet = '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48';
  if (profile.wallet_address.toLowerCase() !== expectedWallet.toLowerCase()) {
    console.warn('\n⚠️  wallet_address mismatch!');
    console.warn('   In user_profiles:', profile.wallet_address);
    console.warn('   Expected (from CDP):', expectedWallet);
  } else {
    console.log('\n✅ wallet_address matches!');
  }

  // Test RLS check
  const podId = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';
  const { data: pod, error: podError } = await supabase
    .from('pods')
    .select('id, name, pod_leads, created_by_address')
    .eq('id', podId)
    .single();

  if (podError) {
    console.error('\n❌ Error fetching pod:', podError);
    return;
  }

  console.log('\n📋 Pod Configuration:');
  console.log('   Pod:', pod.name);
  console.log('   pod_leads:', pod.pod_leads);
  console.log('   created_by_address:', pod.created_by_address);

  const inPodLeads = pod.pod_leads?.some(lead =>
    lead.toLowerCase() === profile.wallet_address.toLowerCase()
  );
  const isCreator = pod.created_by_address?.toLowerCase() === profile.wallet_address.toLowerCase();

  console.log('\n🔐 RLS Permission Check:');
  console.log('   In pod_leads:', inPodLeads ? '✅ YES' : '❌ NO');
  console.log('   Is creator:', isCreator ? '✅ YES' : '❌ NO');

  if (inPodLeads || isCreator) {
    console.log('\n✅ RLS CHECK SHOULD PASS');
    console.log('   If it\'s still failing, the RLS policies might be wrong.');
    console.log('   Check the INSERT policies on pod_modules and chat_groups.');
  } else {
    console.log('\n❌ RLS CHECK WILL FAIL');
    console.log('   Your wallet is not in pod_leads or created_by_address');
  }

  // Try a test INSERT to see actual error
  console.log('\n🧪 Testing pod_modules INSERT...');
  const { data: testInsert, error: testError } = await supabase
    .from('pod_modules')
    .insert({
      pod_id: podId,
      treasury_enabled: true,
      chat_enabled: false,
    })
    .select();

  if (testError) {
    console.error('❌ INSERT failed:', testError);
    if (testError.code === '42501') {
      console.error('   RLS policy violation - this confirms the issue');
    }
  } else {
    console.log('✅ INSERT succeeded!', testInsert);
  }
})();
