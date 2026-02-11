/**
 * Mainnet Deployment Checklist
 *
 * This script guides you through deploying all contracts to Base mainnet.
 * You'll need to compile and deploy contracts using Hardhat or Foundry.
 */

const deploymentSteps = {
  step4: {
    title: 'Deploy SystemTokenV2',
    contract: 'SystemTokenV2.sol',
    constructorArgs: [
      '0', // initialSupply (0 if migrating from V1)
      'YOUR_TREASURY_ADDRESS', // executiveAddress
      '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137', // hatsProtocol (Base mainnet)
      '0x0000008800010000000000000000000000000000000000000000000000000000' // executiveHatId
    ],
    notes: [
      'Replace YOUR_TREASURY_ADDRESS with your multisig/treasury',
      'Initial supply = 0 (existing V1 balances will be migrated)',
      'Verify contract on Basescan after deployment'
    ],
    hardhatCommand: 'npx hardhat run scripts/deploy-systemtokenv2.js --network base',
    foundryCommand: 'forge create src/contracts/SystemTokenV2.sol:SystemTokenV2 --rpc-url $BASE_RPC --private-key $DEPLOYER_PRIVATE_KEY --constructor-args 0 YOUR_TREASURY_ADDRESS 0x3bc1A0Ad72417f2d411118085256fC53CBdDd137 0x0000008800010000000000000000000000000000000000000000000000000000 --verify'
  },

  step5: {
    title: 'Redeploy TokenFaucet',
    contract: 'TokenFaucet.sol',
    constructorArgs: [
      'SYSTEM_TOKEN_V2_ADDRESS', // systemToken (from step 4)
      process.env.NEXT_PUBLIC_SELF_TOKEN // selfToken
    ],
    notes: [
      'Use SystemTokenV2 address from step 4',
      'SelfToken address stays the same',
      'Verify contract on Basescan'
    ],
    hardhatCommand: 'npx hardhat run scripts/deploy-faucet.js --network base',
    foundryCommand: 'forge create src/contracts/TokenFaucet.sol:TokenFaucet --rpc-url $BASE_RPC --private-key $DEPLOYER_PRIVATE_KEY --constructor-args SYSTEM_TOKEN_V2_ADDRESS SELF_TOKEN_ADDRESS --verify'
  },

  step6: {
    title: 'Redeploy PurchaseRouter',
    contract: 'PurchaseRouter.sol',
    constructorArgs: [
      'SYSTEM_TOKEN_V2_ADDRESS', // systemToken (from step 4)
      process.env.NEXT_PUBLIC_SELF_TOKEN, // selfToken
      // ... other constructor params (check your contract)
    ],
    notes: [
      '⚠️  CRITICAL: You will lose on-chain state (products & treasuries)',
      'Make sure you exported state in Phase 1',
      'You will re-import state after deployment',
      'Verify contract on Basescan'
    ],
    hardhatCommand: 'npx hardhat run scripts/deploy-purchase-router.js --network base',
    foundryCommand: 'forge create src/contracts/PurchaseRouter.sol:PurchaseRouter --rpc-url $BASE_RPC --private-key $DEPLOYER_PRIVATE_KEY --constructor-args SYSTEM_TOKEN_V2_ADDRESS SELF_TOKEN_ADDRESS ... --verify'
  },

  step7: {
    title: 'Redeploy PurchaseRouterDecentralized',
    contract: 'PurchaseRouterDecentralized.sol',
    constructorArgs: [
      'SYSTEM_TOKEN_V2_ADDRESS', // systemToken (from step 4)
      process.env.NEXT_PUBLIC_SELF_TOKEN, // selfToken
      // ... other constructor params
    ],
    notes: [
      '⚠️  CRITICAL: You will lose on-chain state (products & treasuries)',
      'Make sure you exported state in Phase 1',
      'You will re-import state after deployment',
      'Verify contract on Basescan'
    ],
    hardhatCommand: 'npx hardhat run scripts/deploy-purchase-router-decentralized.js --network base',
    foundryCommand: 'forge create src/contracts/PurchaseRouterDecentralized.sol:PurchaseRouterDecentralized --rpc-url $BASE_RPC --private-key $DEPLOYER_PRIVATE_KEY --constructor-args SYSTEM_TOKEN_V2_ADDRESS SELF_TOKEN_ADDRESS ... --verify'
  }
};

function printDeploymentGuide() {
  console.log('═'.repeat(80));
  console.log('🚀 MAINNET DEPLOYMENT GUIDE');
  console.log('═'.repeat(80));
  console.log('\n⚠️  PREREQUISITES:');
  console.log('   ✅ Phase 1 complete (state exported from PurchaseRouter)');
  console.log('   ✅ Phase 2 complete (testnet testing passed)');
  console.log('   ✅ Deployer wallet funded with ETH for gas (~0.01 ETH)');
  console.log('   ✅ All contracts compiled');
  console.log('   ✅ Basescan API key configured for verification\n');

  Object.entries(deploymentSteps).forEach(([stepKey, step]) => {
    console.log('─'.repeat(80));
    console.log(`📝 STEP ${stepKey.replace('step', '')}: ${step.title}`);
    console.log('─'.repeat(80));
    console.log(`Contract: ${step.contract}`);
    console.log('\nConstructor Arguments:');
    step.constructorArgs.forEach((arg, i) => {
      console.log(`   ${i + 1}. ${arg}`);
    });
    console.log('\n📋 Notes:');
    step.notes.forEach(note => console.log(`   • ${note}`));
    console.log('\n💻 Hardhat Command:');
    console.log(`   ${step.hardhatCommand}`);
    console.log('\n💻 Foundry Command:');
    console.log(`   ${step.foundryCommand}`);
    console.log('\n✅ After deployment:');
    console.log(`   • Save ${step.title} address`);
    console.log('   • Verify contract on Basescan');
    console.log('   • Update deployment tracker\n');
  });

  console.log('═'.repeat(80));
  console.log('📊 DEPLOYMENT TRACKER');
  console.log('═'.repeat(80));
  console.log('Save deployed addresses here:\n');
  console.log('SYSTEM_TOKEN_V2=');
  console.log('TOKEN_FAUCET=');
  console.log('PURCHASE_ROUTER=');
  console.log('PURCHASE_ROUTER_DECENTRALIZED=');
  console.log('\n');
}

printDeploymentGuide();
