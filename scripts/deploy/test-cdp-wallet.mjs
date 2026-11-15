import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import 'dotenv/config';

console.log('🧪 Testing CDP Wallet Initialization...\n');

// Check environment variables
console.log('📋 Environment Check:');
console.log(`   CDP_API_KEY: ${process.env.CDP_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`   EXECUTIVE_MINTING_PRIVATE_KEY: ${process.env.EXECUTIVE_MINTING_PRIVATE_KEY ? '✅ Set' : '❌ Missing'}`);
console.log('');

if (!process.env.CDP_API_KEY || !process.env.EXECUTIVE_MINTING_PRIVATE_KEY) {
  console.error('❌ Missing required environment variables\n');
  console.log('Required:');
  console.log('  - CDP_API_KEY: Your Coinbase Developer Platform API key name');
  console.log('  - EXECUTIVE_MINTING_PRIVATE_KEY: The private key for CDP API\n');
  process.exit(1);
}

try {
  console.log('🔄 Initializing Coinbase SDK...');

  Coinbase.configure({
    apiKeyName: process.env.CDP_API_KEY,
    privateKey: process.env.EXECUTIVE_MINTING_PRIVATE_KEY,
  });

  console.log('✅ SDK initialized successfully\n');

  console.log('🔄 Creating/fetching wallet...');

  const wallets = await Wallet.listWallets();

  if (wallets.length > 0) {
    console.log(`✅ Found ${wallets.length} existing wallet(s)\n`);

    const wallet = wallets[0];
    const address = await wallet.getDefaultAddress();

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('💼 MINTING WALLET ADDRESS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`   ${address}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('🎯 NEXT STEP: Grant EXECUTIVE_ROLE to this address');
    console.log('');
    console.log('Using Remix:');
    console.log('1. Go to https://remix.ethereum.org/');
    console.log('2. Load SystemToken.sol');
    console.log('3. Connect to Base network with your Executive wallet');
    console.log('4. At Address → Enter SystemToken contract address');
    console.log('5. Call EXECUTIVE_ROLE() to get role hash');
    console.log('6. Call grantRole(roleHash, walletAddress)');
    console.log('   - roleHash: from step 5');
    console.log(`   - walletAddress: ${address}`);
    console.log('');

  } else {
    console.log('⚠️  No existing wallets found');
    console.log('🔄 Creating new wallet...\n');

    const wallet = await Wallet.create();
    const address = await wallet.getDefaultAddress();

    console.log('✅ New wallet created!\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('💼 MINTING WALLET ADDRESS');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`   ${address}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('🎯 NEXT STEP: Grant EXECUTIVE_ROLE to this address');
    console.log('   (See instructions above)');
    console.log('');
  }

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('');
  console.error('Stack trace:', error.stack);
  console.error('');

  if (error.message.includes('Invalid API key')) {
    console.log('💡 TIP: Check that CDP_API_KEY and EXECUTIVE_MINTING_PRIVATE_KEY are correct');
    console.log('   Get these from: https://portal.cdp.coinbase.com/');
  } else if (error.message.includes('network')) {
    console.log('💡 TIP: Check your internet connection');
  }

  process.exit(1);
}
