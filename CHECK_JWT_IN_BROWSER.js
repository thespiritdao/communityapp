// CHECK IF JWT HAS wallet_address FIELD
// Run this in your browser console (F12 → Console tab)
// Make sure you're SIGNED IN first!

(async function checkJWT() {
  console.log('🔍 Checking JWT structure...\n');

  try {
    // Get the current session
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('❌ Error getting session:', error);
      return;
    }

    if (!session) {
      console.error('❌ No session found - are you signed in?');
      return;
    }

    console.log('✅ Session found!');
    console.log('User ID:', session.user.id);
    console.log('Email:', session.user.email);
    console.log('\n📋 JWT Token Structure:\n');

    // Decode JWT (access_token)
    const token = session.access_token;
    const parts = token.split('.');

    if (parts.length !== 3) {
      console.error('❌ Invalid JWT format');
      return;
    }

    // Decode payload (part 2)
    const payload = JSON.parse(atob(parts[1]));

    console.log('JWT Payload:', JSON.stringify(payload, null, 2));
    console.log('\n');

    // Check for wallet_address
    if (payload.wallet_address) {
      console.log('✅ JWT HAS wallet_address:', payload.wallet_address);
      console.log('✅ RLS policies should work now!');
    } else {
      console.log('❌ JWT MISSING wallet_address!');
      console.log('❌ This is why RLS is failing!\n');
      console.log('To fix:');
      console.log('1. Make sure dev server was restarted after JWT fix');
      console.log('2. Sign out of the app');
      console.log('3. Clear browser storage (Application tab → Clear all)');
      console.log('4. Sign back in with your wallet');
      console.log('5. Run this script again to verify');
    }

    console.log('\n📊 JWT Fields Present:');
    Object.keys(payload).forEach(key => {
      console.log(`  - ${key}: ${payload[key]}`);
    });

  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
