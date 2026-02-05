import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import 'dotenv/config';

console.log('🔍 Verifying minting wallet configuration...\n');

try {
  // Initialize SDK
  Coinbase.configure({
    apiKeyName: process.env.CDP_API_KEY,
    privateKey: process.env.EXECUTIVE_MINTING_PRIVATE_KEY.replace(/\\n/g, '\n'),
  });

  console.log('✅ SDK initialized\n');

  // Import wallet from env
  const walletData = process.env.MINTING_WALLET_DATA;

  if (!walletData) {
    console.error('❌ MINTING_WALLET_DATA not found in environment');
    process.exit(1);
  }

  const walletConfig = JSON.parse(walletData);
  const wallet = await Wallet.import(walletConfig);

  const address = await wallet.getDefaultAddress();
  const walletAddress = address.getId();

  console.log('💼 MINTING WALLET INFO');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Address: ${walletAddress}`);
  console.log(`Network: ${walletConfig.networkId}`);
  console.log(`Wallet ID: ${walletConfig.walletId}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('✅ This is the wallet that needs EXECUTIVE_ROLE on SystemToken');
  console.log(`   Expected: 0x71357bC9b9A8346e87d03E162D25fdf6c0bea449`);
  console.log(`   Actual:   ${walletAddress}`);

  if (walletAddress.toLowerCase() === '0x71357bC9b9A8346e87d03E162D25fdf6c0bea449'.toLowerCase()) {
    console.log('\n✅ MATCH! Wallet address is correct.\n');
  } else {
    console.log('\n❌ MISMATCH! This is a different wallet!\n');
    console.log('⚠️  You need to grant EXECUTIVE_ROLE to the wallet shown above.');
  }

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error);
}
