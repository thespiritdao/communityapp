#!/usr/bin/env node

/**
 * Testnet Deployment Script
 *
 * Automatically deploys all contracts to Base Sepolia testnet
 * and saves addresses to .env.testnet file
 *
 * Usage: npm run deploy:testnet
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// Load Environment Variables from .env.testnet
// ============================================================

const envPath = path.join(__dirname, '../../.env.testnet');
if (!fs.existsSync(envPath)) {
  console.error('❌ Error: .env.testnet file not found!');
  console.error('');
  console.error('Please create .env.testnet file:');
  console.error('  1. Copy .env.testnet.example to .env.testnet');
  console.error(
    '  2. Fill in your values (private key, database credentials, etc.)',
  );
  console.error('');
  console.error('Example:');
  console.error('  cp .env.testnet.example .env.testnet');
  console.error('');
  process.exit(1);
}

// Load the .env.testnet file
dotenv.config({ path: envPath });
console.log(`✅ Loaded environment from: .env.testnet\n`);

// ============================================================
// Configuration
// ============================================================

const CHAIN = baseSepolia;
const RPC_URL = process.env.TESTNET_RPC_URL || 'https://sepolia.base.org';

// Get private key and add 0x prefix if missing
let DEPLOYER_PRIVATE_KEY =
  process.env.TESTNET_DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!DEPLOYER_PRIVATE_KEY) {
  console.error(
    '❌ Error: TESTNET_DEPLOYER_PRIVATE_KEY or PRIVATE_KEY not found in .env.testnet',
  );
  console.error('');
  console.error('Add this to your .env.testnet file:');
  console.error('TESTNET_DEPLOYER_PRIVATE_KEY=0xyour_private_key_here');
  console.error('');
  process.exit(1);
}

// Ensure private key has 0x prefix
if (!DEPLOYER_PRIVATE_KEY.startsWith('0x')) {
  DEPLOYER_PRIVATE_KEY = '0x' + DEPLOYER_PRIVATE_KEY;
  console.log('✅ Added 0x prefix to private key\n');
}

// Initialize clients
const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: CHAIN,
  transport: http(RPC_URL),
});

// ============================================================
// Contract ABIs and Bytecode
// ============================================================

// Helper to load contract JSON from compiled artifacts
function loadContract(contractName) {
  try {
    // Try hardhat artifacts first
    const artifactPath = path.join(
      __dirname,
      '../../artifacts/contracts',
      `${contractName}.sol`,
      `${contractName}.json`,
    );
    if (fs.existsSync(artifactPath)) {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
      return { abi: artifact.abi, bytecode: artifact.bytecode };
    }

    // Try foundry out directory
    const foundryPath = path.join(
      __dirname,
      '../../out',
      `${contractName}.sol`,
      `${contractName}.json`,
    );
    if (fs.existsSync(foundryPath)) {
      const artifact = JSON.parse(fs.readFileSync(foundryPath, 'utf8'));
      return { abi: artifact.abi, bytecode: artifact.bytecode.object };
    }

    throw new Error(
      `Contract ${contractName} not found. Please compile contracts first.`,
    );
  } catch (error) {
    console.error(`❌ Error loading contract ${contractName}:`, error.message);
    throw error;
  }
}

// ============================================================
// Deployment Helper Functions
// ============================================================

async function deployContract(contractName, constructorArgs = []) {
  console.log(`\n📦 Deploying ${contractName}...`);

  try {
    const { abi, bytecode } = loadContract(contractName);

    const hash = await walletClient.deployContract({
      abi,
      bytecode,
      args: constructorArgs,
    });

    console.log(`  ⏳ Transaction hash: ${hash}`);
    console.log(`  ⏳ Waiting for confirmation...`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const contractAddress = receipt.contractAddress;

    console.log(`  ✅ ${contractName} deployed to: ${contractAddress}`);
    console.log(`  ⛽ Gas used: ${receipt.gasUsed.toString()}`);

    return { address: contractAddress, abi, receipt };
  } catch (error) {
    console.error(`  ❌ Failed to deploy ${contractName}:`, error.message);
    throw error;
  }
}

async function checkBalance() {
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`💰 Deployer balance: ${formatEther(balance)} ETH`);

  if (balance < parseEther('0.01')) {
    console.warn(
      '⚠️  Warning: Low balance! Get testnet ETH from Base Sepolia faucet',
    );
    console.warn(
      '   Faucet: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet',
    );
  }

  return balance;
}

function saveToEnvFile(deployedContracts) {
  const envPath = path.join(__dirname, '../../.env.testnet');
  let envContent = '';

  // Read existing .env.testnet if it exists
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  } else {
    // Create basic testnet config
    envContent = `# Testnet Environment
# Auto-generated on ${new Date().toISOString()}
# Network: Base Sepolia (Chain ID: 84532)

# ============================================================
# NETWORK CONFIGURATION
# ============================================================
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_IS_TESTNET=true
NEXT_PUBLIC_ENABLE_AUTO_AIRDROP=true

# ============================================================
# TESTNET-SPECIFIC SETTINGS
# ============================================================
NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SYSTEM=1000
NEXT_PUBLIC_TESTNET_AIRDROP_AMOUNT_SELF=500
NEXT_PUBLIC_MIN_POD_LEADERS=1
NEXT_PUBLIC_GOVERNANCE_VOTING_PERIOD=3600
NEXT_PUBLIC_PROPOSAL_THRESHOLD=100

# ============================================================
# DEPLOYED CONTRACT ADDRESSES
# Deployed on ${new Date().toISOString()}
# ============================================================
`;
  }

  // Update or add contract addresses
  for (const [key, address] of Object.entries(deployedContracts)) {
    const envKey = `NEXT_PUBLIC_${key}`;
    const regex = new RegExp(`^${envKey}=.*$`, 'm');

    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${envKey}=${address}`);
    } else {
      envContent += `${envKey}=${address}\n`;
    }
  }

  fs.writeFileSync(envPath, envContent);
  console.log(`\n✅ Contract addresses saved to .env.testnet`);
}

function generateDeploymentReport(deployedContracts, startTime) {
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  const report = `
╔═══════════════════════════════════════════════════════════════╗
║                  DEPLOYMENT COMPLETE ✅                        ║
╚═══════════════════════════════════════════════════════════════╝

Network: Base Sepolia (Chain ID: 84532)
Deployer: ${account.address}
Deployment Time: ${duration}s
Timestamp: ${new Date().toISOString()}

Deployed Contracts:
═══════════════════════════════════════════════════════════════

${Object.entries(deployedContracts)
  .map(([name, address]) => `  ${name.padEnd(40)} ${address}`)
  .join('\n')}

═══════════════════════════════════════════════════════════════

Next Steps:
1. ✅ Contracts deployed and verified
2. ✅ Addresses saved to .env.testnet
3. 🔄 Set up contract permissions (run setup script)
4. 🔄 Test locally: npm run dev:testnet
5. 🔄 Deploy to Vercel with testnet environment

View on Basescan:
https://sepolia.basescan.org/address/${deployedContracts.SYSTEM_TOKEN}

═══════════════════════════════════════════════════════════════
  `;

  console.log(report);

  // Save report to file
  const reportPath = path.join(__dirname, '../../deployment-report-testnet.txt');
  fs.writeFileSync(reportPath, report);
  console.log(`📄 Full report saved to: deployment-report-testnet.txt`);
}

// ============================================================
// Main Deployment Flow
// ============================================================

async function main() {
  console.log('\n');
  console.log(
    '╔═══════════════════════════════════════════════════════════════╗',
  );
  console.log(
    '║         Testnet Deployment Script                            ║',
  );
  console.log(
    '║         Deploying to Base Sepolia                             ║',
  );
  console.log(
    '╚═══════════════════════════════════════════════════════════════╝\n',
  );

  const startTime = Date.now();
  const deployedContracts = {};

  try {
    // Check balance
    await checkBalance();

    console.log('\n🚀 Starting deployment sequence...\n');

    // ============================================================
    // PHASE 1: Token Contracts
    // ============================================================
    console.log(
      '═══════════════════════════════════════════════════════════════',
    );
    console.log('PHASE 1: Token Contracts');
    console.log(
      '═══════════════════════════════════════════════════════════════',
    );

    const systemToken = await deployContract('SystemToken', [
      process.env.TESTNET_SYSTEM_TOKEN_NAME || 'System Token',
      'SYSTEM',
      parseEther('1000000'), // 1M initial supply
    ]);
    deployedContracts.SYSTEM_TOKEN = systemToken.address;

    const selfToken = await deployContract('SelfToken', [
      process.env.TESTNET_SELF_TOKEN_NAME || 'Self Token',
      'SELF',
      parseEther('1000000'), // 1M initial supply
      86400 * 30, // 30 days expiration (testnet)
    ]);
    deployedContracts.SELF_TOKEN = selfToken.address;

    // ============================================================
    // PHASE 2: Governance Contracts
    // ============================================================
    console.log(
      '\n═══════════════════════════════════════════════════════════════',
    );
    console.log('PHASE 2: Governance Contracts');
    console.log(
      '═══════════════════════════════════════════════════════════════',
    );

    const timelock = await deployContract('DAOTimelock', [
      300, // 5 min delay (testnet)
      [], // proposers (will be set later)
      [], // executors (will be set later)
      account.address, // admin
    ]);
    deployedContracts.DAO_TIMELOCK = timelock.address;

    const governor = await deployContract('DAOGovernor', [
      systemToken.address, // voting token
      timelock.address, // timelock
      process.env.TESTNET_GOVERNOR_NAME || 'DAO Governor',
      3600, // 1 hour voting period (testnet)
      300, // 5 min voting delay (testnet)
      100, // 100 token proposal threshold (testnet)
    ]);
    deployedContracts.DAO_GOVERNOR = governor.address;

    // ============================================================
    // PHASE 3: Purchase & Marketplace Contracts
    // ============================================================
    console.log(
      '\n═══════════════════════════════════════════════════════════════',
    );
    console.log('PHASE 3: Purchase & Marketplace Contracts');
    console.log(
      '═══════════════════════════════════════════════════════════════',
    );

    const purchaseBurn = await deployContract('PurchaseBurn', [
      systemToken.address,
      selfToken.address,
    ]);
    deployedContracts.PURCHASE_BURN = purchaseBurn.address;

    const purchaseRouter = await deployContract('PurchaseRouter', [
      systemToken.address,
      account.address, // treasury
    ]);
    deployedContracts.PURCHASE_ROUTER = purchaseRouter.address;

    const purchaseRouterDecentralized = await deployContract(
      'PurchaseRouterDecentralized',
      [systemToken.address],
    );
    deployedContracts.PURCHASE_ROUTER_DECENTRALIZED =
      purchaseRouterDecentralized.address;

    // ============================================================
    // PHASE 4: Event Contracts
    // ============================================================
    console.log(
      '\n═══════════════════════════════════════════════════════════════',
    );
    console.log('PHASE 4: Event Contracts');
    console.log(
      '═══════════════════════════════════════════════════════════════',
    );

    const eventManager = await deployContract('EventManager');
    deployedContracts.EVENT_MANAGER = eventManager.address;

    const eventRegistrationFactory = await deployContract(
      'EventRegistrationNFTFactory',
    );
    deployedContracts.EVENT_REGISTRATION_FACTORY =
      eventRegistrationFactory.address;

    const eventCompletionFactory = await deployContract(
      'EventCompletionNFTFactory',
    );
    deployedContracts.EVENT_COMPLETION_FACTORY = eventCompletionFactory.address;

    const eventEscrow = await deployContract('EventEscrow', [
      systemToken.address,
    ]);
    deployedContracts.EVENT_ESCROW = eventEscrow.address;

    // ============================================================
    // PHASE 5: Pod Management Contracts
    // ============================================================
    console.log(
      '\n═══════════════════════════════════════════════════════════════',
    );
    console.log('PHASE 5: Pod Management Contracts');
    console.log(
      '═══════════════════════════════════════════════════════════════',
    );

    const podAuthFactory = await deployContract('PodAuthorizationFactory');
    deployedContracts.POD_AUTH_FACTORY = podAuthFactory.address;

    const podCreationManager = await deployContract('PodCreationManager', [
      systemToken.address,
      account.address, // hats protocol address (update later)
    ]);
    deployedContracts.POD_CREATION_MANAGER = podCreationManager.address;

    const podTreasuryFactory = await deployContract('PodTreasuryFactory', [
      systemToken.address,
      selfToken.address,
    ]);
    deployedContracts.POD_TREASURY_FACTORY = podTreasuryFactory.address;

    const simplePodRegistry = await deployContract('SimplePodRegistry');
    deployedContracts.SIMPLE_POD_REGISTRY = simplePodRegistry.address;

    // ============================================================
    // PHASE 6: Bounty Contracts
    // ============================================================
    console.log(
      '\n═══════════════════════════════════════════════════════════════',
    );
    console.log('PHASE 6: Bounty Contracts');
    console.log(
      '═══════════════════════════════════════════════════════════════',
    );

    const bountyManager = await deployContract('BountyManagerV2', [
      systemToken.address,
      selfToken.address,
    ]);
    deployedContracts.BOUNTY_MANAGER_ADDRESS = bountyManager.address;

    const podBountyService = await deployContract('PodBountyService', [
      systemToken.address,
      selfToken.address,
    ]);
    deployedContracts.POD_BOUNTY_SERVICE = podBountyService.address;

    // ============================================================
    // PHASE 7: Hats Protocol Modules
    // ============================================================
    console.log(
      '\n═══════════════════════════════════════════════════════════════',
    );
    console.log('PHASE 7: Hats Protocol Modules');
    console.log(
      '═══════════════════════════════════════════════════════════════',
    );

    const eligibilityModule = await deployContract(
      'MultiCriteriaEligibilityModule',
    );
    deployedContracts.ELIGIBILITY_MODULE_ADDRESS = eligibilityModule.address;

    const timeBasedToggle = await deployContract('TimeBasedToggleModule');
    deployedContracts.TIME_BASED_TOGGLE_MODULE = timeBasedToggle.address;

    const simpleToggle = await deployContract('SimpleToggleModule');
    deployedContracts.SIMPLE_TOGGLE_MODULE = simpleToggle.address;

    // ============================================================
    // Deployment Complete
    // ============================================================
    console.log(
      '\n═══════════════════════════════════════════════════════════════',
    );
    console.log('All contracts deployed successfully!');
    console.log(
      '═══════════════════════════════════════════════════════════════\n',
    );

    // Save addresses to .env.testnet
    saveToEnvFile(deployedContracts);

    // Generate deployment report
    generateDeploymentReport(deployedContracts, startTime);

    console.log('\n✅ Deployment complete! Next steps:');
    console.log('   1. Review deployment-report-testnet.txt');
    console.log('   2. Configure roles and permissions as described in docs/SETUP.md');
    console.log('   3. Run: npm run dev:testnet (to test locally)');
    console.log('   4. Deploy to Vercel with .env.testnet variables\n');
  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    console.error('\nPartially deployed contracts:');
    console.table(deployedContracts);
    process.exit(1);
  }
}

// Run deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
