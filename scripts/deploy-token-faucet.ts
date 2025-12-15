/**
 * Deploy TokenFaucet Contract
 *
 * Deploys the TokenFaucet contract and provides Coinbase whitelist information.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-token-faucet.ts --network base
 */

import { ethers } from 'hardhat';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const SYSTEM_TOKEN = process.env.NEXT_PUBLIC_SYSTEM_TOKEN;
  const SELF_TOKEN = process.env.NEXT_PUBLIC_SELF_TOKEN;

  if (!SYSTEM_TOKEN || !SELF_TOKEN) {
    throw new Error('Missing token addresses in .env');
  }

  console.log('🚰 Deploying TokenFaucet Contract');
  console.log('='.repeat(60));
  console.log(`SYSTEM Token: ${SYSTEM_TOKEN}`);
  console.log(`SELF Token: ${SELF_TOKEN}`);
  console.log('='.repeat(60));
  console.log('');

  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying from: ${deployer.address}`);
  console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
  console.log('');

  // Deploy TokenFaucet
  console.log('📤 Deploying TokenFaucet...');
  const TokenFaucet = await ethers.getContractFactory('TokenFaucet');
  const faucet = await TokenFaucet.deploy(SYSTEM_TOKEN, SELF_TOKEN);

  await faucet.waitForDeployment();
  const faucetAddress = await faucet.getAddress();

  console.log('✅ TokenFaucet deployed!');
  console.log(`   Address: ${faucetAddress}`);
  console.log('');

  // Verification info
  console.log('🔍 Contract Verification');
  console.log('='.repeat(60));
  console.log('Run this command to verify on BaseScan:');
  console.log('');
  console.log(`npx hardhat verify --network base ${faucetAddress} "${SYSTEM_TOKEN}" "${SELF_TOKEN}"`);
  console.log('');
  console.log('='.repeat(60));
  console.log('');

  // Coinbase Paymaster Whitelist Information
  console.log('💳 COINBASE PAYMASTER WHITELIST INFORMATION');
  console.log('='.repeat(60));
  console.log('');
  console.log('**Contract Address:**');
  console.log(faucetAddress);
  console.log('');
  console.log('**Functions to Whitelist:**');
  console.log('');
  console.log('1. claimTokens()');
  console.log('   - Signature: claimTokens()');
  console.log('   - Description: Allows users to claim 10 SYSTEM + 10 SELF tokens once per 24 hours');
  console.log('   - Gas estimate: ~100,000');
  console.log('');
  console.log('='.repeat(60));
  console.log('');

  // Environment variable update
  console.log('📝 UPDATE YOUR .env FILE');
  console.log('='.repeat(60));
  console.log('');
  console.log('Add this line to your .env:');
  console.log('');
  console.log(`NEXT_PUBLIC_TOKEN_FAUCET=${faucetAddress}`);
  console.log('');
  console.log('='.repeat(60));
  console.log('');

  // Next steps
  console.log('📋 NEXT STEPS');
  console.log('='.repeat(60));
  console.log('');
  console.log('1. ✅ Update .env with NEXT_PUBLIC_TOKEN_FAUCET address');
  console.log('2. 📝 Verify contract on BaseScan (command above)');
  console.log('3. 💳 Whitelist claimTokens() on Coinbase Paymaster dashboard');
  console.log('4. 💰 Fund faucet with tokens:');
  console.log(`   npx tsx scripts/fund-faucet.ts`);
  console.log('5. 🧪 Test claiming on frontend');
  console.log('');
  console.log('='.repeat(60));
  console.log('');
  console.log('✨ Deployment complete!');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
