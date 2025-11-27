#!/usr/bin/env node

/**
 * Bounty Escrow Testing Script
 * Tests the complete bounty lifecycle with escrow verification
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

// Contract ABIs
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

const BOUNTY_MANAGER_ABI = [
  'function createBounty(uint128 value, address token, uint8 paymentType, string calldata ipfsHash) returns (uint256)',
  'function placeBid(uint256 bountyId)',
  'function assignBounty(uint256 bountyId, address bidder, address reviewer, address approver)',
  'function releasePayment(uint256 bountyId, uint128 amount)',
  'function cancelBounty(uint256 bountyId)',
  'function getBounty(uint256 bountyId) view returns (address creator, uint128 value, address token, uint8 status, string ipfsHash)',
  'function getAssignment(uint256 bountyId) view returns (address bidder, address reviewer, uint128 escrowAmount, uint128 paidAmount)',
  'event BountyCreated(uint256 indexed id, address indexed creator, string ipfsHash)',
  'event EscrowFunded(uint256 indexed bountyId, uint256 amount)',
  'event PaymentReleased(uint256 indexed bountyId, address indexed to, uint256 amount)',
  'event BountyCancelled(uint256 indexed bountyId)',
];

// Configuration
const config = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org',
  bountyManagerAddress: process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS,
  systemToken:
    process.env.NEXT_PUBLIC_SYSTEM_TOKEN ||
    '0x1317Ae277266D38C4E492558f8693F14143a6A65',
  selfToken:
    process.env.NEXT_PUBLIC_SELF_TOKEN ||
    '0xe9b4aB2eB9397fa41AC3223e96f9d988BeFF5D21',
  privateKey: process.env.PRIVATE_KEY || process.env.TEST_PRIVATE_KEY,
};

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('');
  log(`${'='.repeat(50)}`, colors.cyan);
  log(title, colors.bright + colors.cyan);
  log(`${'='.repeat(50)}`, colors.cyan);
}

async function main() {
  try {
    logSection('🚀 BOUNTY ESCROW TESTING SUITE');

    // Validate configuration
    if (!config.privateKey) {
      throw new Error('PRIVATE_KEY not found in environment variables');
    }

    if (!config.bountyManagerAddress) {
      throw new Error('NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS not found');
    }

    // Setup provider and wallet
    log('\n📡 Connecting to Base network...', colors.blue);
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const wallet = new ethers.Wallet(config.privateKey, provider);

    // Get network info
    const network = await provider.getNetwork();
    log(
      `✅ Connected to network: ${network.name} (Chain ID: ${network.chainId})`,
      colors.green,
    );
    log(`👛 Wallet address: ${wallet.address}`, colors.blue);

    // Setup contracts
    const bountyContract = new ethers.Contract(
      config.bountyManagerAddress,
      BOUNTY_MANAGER_ABI,
      wallet,
    );

    const systemToken = new ethers.Contract(
      config.systemToken,
      ERC20_ABI,
      wallet,
    );

    // Check initial balances
    logSection('💰 INITIAL BALANCES');
    const walletBalance = await systemToken.balanceOf(wallet.address);
    const contractBalance = await systemToken.balanceOf(
      config.bountyManagerAddress,
    );

    log(`Wallet SYSTEM balance: ${ethers.formatEther(walletBalance)} SYSTEM`);
    log(
      `Contract escrow balance: ${ethers.formatEther(contractBalance)} SYSTEM`,
    );

    if (walletBalance === 0n) {
      log('\n⚠️  WARNING: Your wallet has 0 SYSTEM tokens!', colors.yellow);
      log('You need SYSTEM tokens to create bounties.', colors.yellow);
      return;
    }

    // Test menu
    logSection('📋 SELECT TEST SCENARIO');
    log('1. Test Bounty Creation with Escrow');
    log('2. Test Complete Bounty Lifecycle');
    log('3. Test Bounty Cancellation & Refund');
    log('4. Create Test Wallets for Multi-party Testing');
    log('5. Monitor Existing Bounty');
    log('6. Check All Escrow Balances');

    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const choice = await new Promise((resolve) => {
      rl.question('\nEnter your choice (1-6): ', resolve);
    });
    rl.close();

    switch (choice) {
      case '1':
        await testBountyCreation(wallet, bountyContract, systemToken);
        break;
      case '2':
        await testCompleteCycle(wallet, bountyContract, systemToken);
        break;
      case '3':
        await testCancellation(wallet, bountyContract, systemToken);
        break;
      case '4':
        await createTestWallets();
        break;
      case '5':
        await monitorBounty(bountyContract, systemToken);
        break;
      case '6':
        await checkAllEscrow(bountyContract, systemToken);
        break;
      default:
        log('Invalid choice!', colors.red);
    }
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, colors.red);
    console.error(error);
  }
}

async function testBountyCreation(wallet, bountyContract, systemToken) {
  logSection('🧪 TEST 1: BOUNTY CREATION WITH ESCROW');

  const amount = ethers.parseEther('1'); // Test with 1 SYSTEM token

  // Check allowance
  log('\n🔍 Checking token allowance...', colors.blue);
  const allowance = await systemToken.allowance(
    wallet.address,
    bountyContract.target,
  );

  if (allowance < amount) {
    log('📝 Approving tokens for bounty contract...', colors.yellow);
    const approveTx = await systemToken.approve(bountyContract.target, amount);
    await approveTx.wait();
    log('✅ Approval successful!', colors.green);
  }

  // Record balance before
  const balanceBefore = await systemToken.balanceOf(wallet.address);
  const escrowBefore = await systemToken.balanceOf(bountyContract.target);

  log('\n💫 Creating bounty...', colors.blue);
  log(`  Amount: ${ethers.formatEther(amount)} SYSTEM`);
  log(`  Payment Type: Completion (0)`);

  // Create bounty with test IPFS hash
  const tx = await bountyContract.createBounty(
    amount,
    systemToken.target,
    0, // PaymentType.Completion
    'QmTest' + Date.now(), // Unique test hash
  );

  log('⏳ Waiting for confirmation...', colors.yellow);
  const receipt = await tx.wait();

  // Extract bounty ID from events
  const event = receipt.logs.find(
    (log) =>
      log.topics[0] === ethers.id('BountyCreated(uint256,address,string)'),
  );
  const bountyId = event ? ethers.toBigInt(event.topics[1]) : null;

  // Verify escrow
  const balanceAfter = await systemToken.balanceOf(wallet.address);
  const escrowAfter = await systemToken.balanceOf(bountyContract.target);

  logSection('✅ ESCROW VERIFICATION');
  log(`Bounty ID: ${bountyId}`);
  log(`Transaction Hash: ${receipt.hash}`);
  log(`Gas Used: ${receipt.gasUsed.toString()}`);
  log('');
  log('Token Movement:');
  log(
    `  Wallet: ${ethers.formatEther(balanceBefore)} → ${ethers.formatEther(balanceAfter)} SYSTEM`,
  );
  log(
    `  Escrow: ${ethers.formatEther(escrowBefore)} → ${ethers.formatEther(escrowAfter)} SYSTEM`,
  );
  log(
    `  Transferred: ${ethers.formatEther(balanceBefore - balanceAfter)} SYSTEM`,
  );

  if (
    balanceBefore - balanceAfter === amount &&
    escrowAfter - escrowBefore === amount
  ) {
    log('\n✅ ESCROW TEST PASSED!', colors.green);
  } else {
    log('\n❌ ESCROW TEST FAILED!', colors.red);
  }

  return bountyId;
}

async function testCancellation(wallet, bountyContract, systemToken) {
  logSection('🧪 TEST 3: CANCELLATION & REFUND');

  // First create a bounty
  const bountyId = await testBountyCreation(
    wallet,
    bountyContract,
    systemToken,
  );

  if (!bountyId) {
    log('❌ Failed to create bounty for cancellation test', colors.red);
    return;
  }

  log('\n⏰ Waiting 3 seconds before cancellation...', colors.yellow);
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Record balance before cancellation
  const balanceBefore = await systemToken.balanceOf(wallet.address);
  const escrowBefore = await systemToken.balanceOf(bountyContract.target);

  log('\n🚫 Cancelling bounty...', colors.blue);
  const cancelTx = await bountyContract.cancelBounty(bountyId);
  const cancelReceipt = await cancelTx.wait();

  // Check balances after
  const balanceAfter = await systemToken.balanceOf(wallet.address);
  const escrowAfter = await systemToken.balanceOf(bountyContract.target);

  logSection('✅ REFUND VERIFICATION');
  log(`Transaction Hash: ${cancelReceipt.hash}`);
  log('');
  log('Refund Details:');
  log(
    `  Wallet: ${ethers.formatEther(balanceBefore)} → ${ethers.formatEther(balanceAfter)} SYSTEM`,
  );
  log(
    `  Escrow: ${ethers.formatEther(escrowBefore)} → ${ethers.formatEther(escrowAfter)} SYSTEM`,
  );
  log(`  Refunded: ${ethers.formatEther(balanceAfter - balanceBefore)} SYSTEM`);

  if (balanceAfter > balanceBefore) {
    log('\n✅ REFUND TEST PASSED!', colors.green);
  } else {
    log('\n❌ REFUND TEST FAILED!', colors.red);
  }
}

async function createTestWallets() {
  logSection('🔑 CREATING TEST WALLETS');

  const bidder = ethers.Wallet.createRandom();
  const reviewer = ethers.Wallet.createRandom();
  const approver = ethers.Wallet.createRandom();

  log('\n📝 Test Wallets Created:', colors.green);
  log('\nBIDDER:', colors.cyan);
  log(`  Address: ${bidder.address}`);
  log(`  Private Key: ${bidder.privateKey}`);

  log('\nREVIEWER:', colors.cyan);
  log(`  Address: ${reviewer.address}`);
  log(`  Private Key: ${reviewer.privateKey}`);

  log('\nAPPROVER:', colors.cyan);
  log(`  Address: ${approver.address}`);
  log(`  Private Key: ${approver.privateKey}`);

  log('\n⚠️  IMPORTANT:', colors.yellow);
  log('1. Save these private keys securely');
  log('2. Send ETH to these addresses for gas');
  log('3. Send SYSTEM tokens if they need to create bounties');
  log('4. Grant appropriate Hat tokens for permissions');

  return { bidder, reviewer, approver };
}

async function monitorBounty(bountyContract, systemToken) {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const bountyId = await new Promise((resolve) => {
    rl.question('\nEnter Bounty ID to monitor: ', resolve);
  });
  rl.close();

  logSection(`📊 MONITORING BOUNTY #${bountyId}`);

  try {
    const bounty = await bountyContract.getBounty(bountyId);
    const [creator, value, token, status, ipfsHash] = bounty;

    log('\nBounty Details:');
    log(`  Creator: ${creator}`);
    log(`  Value: ${ethers.formatEther(value)} tokens`);
    log(`  Token: ${token}`);
    log(`  Status: ${['Open', 'Assigned', 'Completed', 'Cancelled'][status]}`);
    log(`  IPFS Hash: ${ipfsHash}`);

    try {
      const assignment = await bountyContract.getAssignment(bountyId);
      const [bidder, reviewer, escrowAmount, paidAmount] = assignment;

      if (bidder !== ethers.ZeroAddress) {
        log('\nAssignment Details:');
        log(`  Bidder: ${bidder}`);
        log(`  Reviewer: ${reviewer}`);
        log(`  Escrow: ${ethers.formatEther(escrowAmount)} tokens`);
        log(`  Paid: ${ethers.formatEther(paidAmount)} tokens`);
      }
    } catch (e) {
      // No assignment yet
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`, colors.red);
  }
}

async function checkAllEscrow(bountyContract, systemToken) {
  logSection('💰 ALL ESCROW BALANCES');

  const contractBalance = await systemToken.balanceOf(bountyContract.target);
  log(`Total Contract Escrow: ${ethers.formatEther(contractBalance)} SYSTEM`);

  // You could iterate through bounty IDs here to show individual escrows
  log(
    '\n💡 Tip: Use "Monitor Existing Bounty" to check specific bounty escrows',
  );
}

async function testCompleteCycle(wallet, bountyContract, systemToken) {
  logSection('🧪 TEST 2: COMPLETE BOUNTY LIFECYCLE');

  log('\n⚠️  Note: This test requires multiple wallets.', colors.yellow);
  log('Creating a simplified single-wallet test...', colors.yellow);

  // Create bounty
  const bountyId = await testBountyCreation(
    wallet,
    bountyContract,
    systemToken,
  );

  if (!bountyId) {
    log('❌ Failed to create bounty', colors.red);
    return;
  }

  try {
    // Try to bid on own bounty (will likely fail but shows the flow)
    log('\n📝 Attempting to bid on bounty...', colors.blue);
    const bidTx = await bountyContract.placeBid(bountyId);
    await bidTx.wait();
    log('✅ Bid placed!', colors.green);

    // Assign to self (admin only)
    log('\n👥 Assigning bounty...', colors.blue);
    const assignTx = await bountyContract.assignBounty(
      bountyId,
      wallet.address, // bidder
      wallet.address, // reviewer
      wallet.address, // approver
    );
    await assignTx.wait();
    log('✅ Bounty assigned!', colors.green);

    // Release payment
    log('\n💸 Releasing payment...', colors.blue);
    const bounty = await bountyContract.getBounty(bountyId);
    const releaseTx = await bountyContract.releasePayment(
      bountyId,
      bounty[1], // Full value
    );
    await releaseTx.wait();
    log('✅ Payment released!', colors.green);
  } catch (error) {
    log(
      `\n⚠️  Expected error in single-wallet test: ${error.message}`,
      colors.yellow,
    );
    log(
      'Use created test wallets for proper multi-party testing.',
      colors.yellow,
    );
  }
}

// Run the script
main().catch(console.error);
