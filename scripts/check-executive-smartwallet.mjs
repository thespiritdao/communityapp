import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 Finding executive Smart Wallet addresses...\n');

try {
  // Get all executives with their wallet addresses
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('wallet_address, smart_wallet_address, display_name, email')
    .or('is_executive.eq.true,role.eq.executive');

  if (error) {
    console.error('❌ Error fetching executives:', error);
    process.exit(1);
  }

  if (!profiles || profiles.length === 0) {
    console.log('❌ No executives found in database');
    process.exit(1);
  }

  console.log('👥 EXECUTIVE WALLETS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  for (const profile of profiles) {
    console.log(`Name: ${profile.display_name || profile.email || 'Unknown'}`);
    console.log(`EOA Wallet: ${profile.wallet_address || 'Not set'}`);
    console.log(`Smart Wallet: ${profile.smart_wallet_address || 'Not set'}`);
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('⚠️  IMPORTANT: Grant EXECUTIVE_ROLE to the SMART WALLET addresses above!');
  console.log('   The backend server wallet (0x71357bC9b9A8346e87d03E162D25fdf6c0bea449)');
  console.log('   is NOT needed since minting happens on frontend.\n');

} catch (error) {
  console.error('❌ Error:', error.message);
}
