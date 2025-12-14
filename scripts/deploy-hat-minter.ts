/**
 * Deploy HatMinter Contract
 *
 * Deploys the HatMinter contract to Base mainnet/testnet
 * This contract mints Beta Tester hats with gas sponsored by Coinbase Paymaster
 *
 * Usage:
 *   tsx scripts/deploy-hat-minter.ts
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  formatEther,
  getContract,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

// Configuration
const DEPLOYER_PRIVATE_KEY = process.env.PRIVATE_KEY || process.env.POD_ADMIN_PRIVATE_KEY;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const HATS_PROTOCOL = process.env.NEXT_PUBLIC_HATS_CONTRACT || '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const BETA_TESTER_HAT = process.env.NEXT_PUBLIC_BETA_TESTER_HAT;
const EXEC_LEADER_HAT = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER;

// Read contract bytecode
const BYTECODE = fs.readFileSync(
  path.join(__dirname, '../contracts/HatMinter.bytecode'),
  'utf-8'
).trim() as `0x${string}`;

const CONTRACT_ABI = parseAbi([
  'constructor(address _hatsProtocol, uint256 _betaTesterHatId, uint256 _executiveLeaderHatId, address _initialOwner)',
  'function mintBetaTesterHat(address recipient) external returns (bool)',
  'function mintExecutiveLeaderHat(address recipient) external returns (bool)',
  'function setAuthorizedCaller(address caller, bool authorized) external',
  'function hasAdminHat() external view returns (bool)',
  'function owner() external view returns (address)',
]);

async function deployHatMinter() {
  console.log('\n🚀 HAT MINTER CONTRACT DEPLOYMENT');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Validate configuration
  if (!DEPLOYER_PRIVATE_KEY) {
    console.error('❌ ERROR: No deployer private key found');
    console.error('   Set PRIVATE_KEY or POD_ADMIN_PRIVATE_KEY in .env\n');
    process.exit(1);
  }

  if (!BETA_TESTER_HAT || !EXEC_LEADER_HAT) {
    console.error('❌ ERROR: Hat IDs not configured');
    console.error('   Set NEXT_PUBLIC_BETA_TESTER_HAT and NEXT_PUBLIC_EXECUTIVE_POD_LEADER in .env\n');
    process.exit(1);
  }

  // Initialize account
  const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY as `0x${string}`);
  console.log('🔐 Deployer Account:');
  console.log(`   Address: ${account.address}\n`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(RPC_URL),
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log('💰 Account Balance:');
  console.log(`   ${formatEther(balance)} ETH\n`);

  if (balance === 0n) {
    console.error('❌ ERROR: Deployer account has no ETH');
    console.error('   Send ETH to cover deployment gas fees\n');
    process.exit(1);
  }

  // Display deployment parameters
  console.log('📋 Deployment Parameters:');
  console.log(`   Hats Protocol: ${HATS_PROTOCOL}`);
  console.log(`   Beta Tester Hat: ${BETA_TESTER_HAT}`);
  console.log(`   Executive Leader Hat: ${EXEC_LEADER_HAT}`);
  console.log(`   Initial Owner: ${account.address}\n`);

  // Deploy contract
  console.log('📤 Deploying HatMinter contract...\n');

  try {
    const hash = await walletClient.deployContract({
      abi: CONTRACT_ABI,
      bytecode: BYTECODE,
      args: [
        HATS_PROTOCOL as `0x${string}`,
        BigInt(BETA_TESTER_HAT),
        BigInt(EXEC_LEADER_HAT),
        account.address,
      ],
    });

    console.log(`   ⏳ Transaction hash: ${hash}`);
    console.log('   Waiting for confirmation...\n');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status !== 'success') {
      throw new Error('Deployment transaction failed');
    }

    const contractAddress = receipt.contractAddress;
    if (!contractAddress) {
      throw new Error('No contract address in receipt');
    }

    console.log('✅ CONTRACT DEPLOYED SUCCESSFULLY!');
    console.log('───────────────────────────────────────────────────────────');
    console.log(`Contract Address: ${contractAddress}`);
    console.log(`Block Number: ${receipt.blockNumber}`);
    console.log(`Gas Used: ${receipt.gasUsed}`);
    console.log('───────────────────────────────────────────────────────────\n');

    // Verify contract state
    console.log('🔍 Verifying contract state...\n');

    const contract = getContract({
      address: contractAddress,
      abi: CONTRACT_ABI,
      client: publicClient,
    });

    const owner = await contract.read.owner();
    console.log(`   Owner: ${owner} ${owner === account.address ? '✅' : '❌'}`);

    // Check if contract has admin hat
    const hasAdminHat = await contract.read.hasAdminHat();
    console.log(`   Has Admin Hat: ${hasAdminHat ? '✅ Yes' : '❌ No (needs to be minted)'}\n`);

    // Save deployment info
    const deploymentInfo = {
      contractAddress,
      deployer: account.address,
      blockNumber: receipt.blockNumber.toString(),
      transactionHash: hash,
      timestamp: new Date().toISOString(),
      network: 'Base',
      chainId: base.id,
    };

    const deploymentPath = path.join(__dirname, '../deployments/hat-minter.json');
    fs.mkdirSync(path.dirname(deploymentPath), { recursive: true });
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));

    console.log('💾 Deployment info saved to:');
    console.log(`   ${deploymentPath}\n`);

    // Next steps
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 NEXT STEPS');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('1️⃣  ADD TO YOUR .ENV FILE:');
    console.log('───────────────────────────────────────────────────────────');
    console.log('Add this line to your .env file:\n');
    console.log(`NEXT_PUBLIC_HAT_MINTER_CONTRACT=${contractAddress}\n`);

    console.log('2️⃣  MINT EXECUTIVE POD LEADER HAT TO CONTRACT:');
    console.log('───────────────────────────────────────────────────────────');
    console.log('Using your Coinbase Smart Wallet, mint the Executive Pod');
    console.log('Leader hat to the contract:\n');
    console.log(`Contract Address: ${contractAddress}`);
    console.log(`Hat ID: ${EXEC_LEADER_HAT}\n`);
    console.log('You can do this via:');
    console.log('  a) Hats Protocol UI: https://app.hatsprotocol.xyz');
    console.log('  b) Your DAO multisig');
    console.log('  c) Direct contract interaction\n');

    console.log('3️⃣  WHITELIST WITH COINBASE PAYMASTER:');
    console.log('───────────────────────────────────────────────────────────');
    console.log('Contact Coinbase to whitelist this contract address for');
    console.log('paymaster sponsorship:\n');
    console.log(`Contract: ${contractAddress}`);
    console.log('Submit request: https://www.coinbase.com/cloud/products/base\n');

    console.log('4️⃣  AUTHORIZE YOUR BACKEND:');
    console.log('───────────────────────────────────────────────────────────');
    console.log('If your backend will call from a specific address, authorize it:\n');
    console.log('  tsx scripts/authorize-backend-caller.ts <BACKEND_ADDRESS>\n');

    console.log('5️⃣  VERIFY SETUP:');
    console.log('───────────────────────────────────────────────────────────');
    console.log('After steps 2-3, verify everything works:\n');
    console.log('  tsx scripts/test-hat-minter.ts\n');

    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ DEPLOYMENT FAILED:', error);
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
    }
    process.exit(1);
  }
}

deployHatMinter();
