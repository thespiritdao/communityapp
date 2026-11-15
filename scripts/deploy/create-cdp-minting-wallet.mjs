import { Coinbase, Wallet } from '@coinbase/coinbase-sdk';
import { writeFileSync } from 'fs';
import 'dotenv/config';

console.log('🔧 Creating persistent CDP wallet for minting...\n');

try {
  Coinbase.configure({
    apiKeyName: process.env.CDP_API_KEY,
    privateKey: process.env.EXECUTIVE_MINTING_PRIVATE_KEY.replace(/\\n/g, '\n'),
  });

  console.log('✅ SDK initialized\n');
  console.log('🔄 Creating wallet on base-mainnet...\n');

  const wallet = await Wallet.create({ networkId: 'base-mainnet' });
  const address = await wallet.getDefaultAddress();

  console.log('✅ Wallet created successfully!\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('💼 MINTING WALLET ADDRESS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   ${address.getId()}`);
  console.log(`   Network: base-mainnet`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Export wallet data for persistence
  const walletData = await wallet.export();

  // Save to file (DO NOT COMMIT THIS FILE)
  writeFileSync('.wallet-data.json', JSON.stringify(walletData, null, 2));
  console.log('💾 Wallet data saved to .wallet-data.json');
  console.log('⚠️  KEEP THIS FILE SECURE - DO NOT COMMIT TO GIT\n');

  console.log('🎯 NEXT STEPS:');
  console.log('1. Add to .gitignore: echo ".wallet-data.json" >> .gitignore');
  console.log(`2. Grant EXECUTIVE_ROLE to: ${address.getId()}`);
  console.log('3. Add wallet data to Vercel as MINTING_WALLET_DATA environment variable');
  console.log('4. Update minting code to import this wallet instead of creating new ones');

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error);
}
