import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import 'dotenv/config';

console.log('🔍 Listing all CDP wallets...\n');

try {
  Coinbase.configure({
    apiKeyName: process.env.CDP_API_KEY,
    privateKey: process.env.EXECUTIVE_MINTING_PRIVATE_KEY.replace(/\\n/g, '\n'),
  });

  console.log('✅ SDK initialized\n');

  const walletsResult = await Wallet.listWallets();
  const wallets = Array.isArray(walletsResult) ? walletsResult : [];

  console.log(`Found ${wallets.length} wallet(s):\n`);

  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    try {
      const address = await wallet.getDefaultAddress();
      const addressStr = address.toString();

      console.log(`${i + 1}. Wallet:`);
      console.log(`   Address: ${addressStr}`);
      console.log(`   Network: ${addressStr.includes('base-mainnet') ? 'BASE MAINNET ✅' : addressStr.includes('sepolia') ? 'Base Sepolia (testnet)' : 'Unknown'}`);
      console.log('');
    } catch (e) {
      console.log(`${i + 1}. Wallet: Error accessing - ${e.message}`);
      console.log('');
    }
  }

  console.log('\n🎯 NEXT STEPS:');
  console.log('If you see a base-mainnet wallet, grant EXECUTIVE_ROLE to that address');
  console.log('If all wallets are on sepolia, we need to fix the network configuration');

} catch (error) {
  console.error('❌ Error:', error.message);
}
