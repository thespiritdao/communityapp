/**
 * Authorize Backend Caller
 *
 * Authorizes the backend admin wallet to call HatMinter contract functions
 * Must be run by the contract owner
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  getContract,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const HAT_MINTER = process.env.NEXT_PUBLIC_HAT_MINTER;
const OWNER_PRIVATE_KEY = process.env.PRIVATE_KEY; // Contract owner's key
const ADMIN_WALLET_TO_AUTHORIZE = process.env.POD_ADMIN_PRIVATE_KEY;

const HAT_MINTER_ABI = parseAbi([
  'function setAuthorizedCaller(address caller, bool authorized) external',
  'function isAuthorizedCaller(address caller) external view returns (bool)',
  'function owner() external view returns (address)',
]);

async function authorize() {
  console.log('\n🔐 AUTHORIZE BACKEND CALLER');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Validate configuration
  if (!HAT_MINTER) {
    console.error('❌ ERROR: HatMinter contract not configured');
    console.error('   Set NEXT_PUBLIC_HAT_MINTER in .env\n');
    process.exit(1);
  }

  if (!OWNER_PRIVATE_KEY) {
    console.error('❌ ERROR: Owner private key not found');
    console.error('   Set PRIVATE_KEY in .env (must be contract owner)\n');
    process.exit(1);
  }

  if (!ADMIN_WALLET_TO_AUTHORIZE) {
    console.error('❌ ERROR: Admin wallet private key not found');
    console.error('   Set POD_ADMIN_PRIVATE_KEY in .env\n');
    process.exit(1);
  }

  const ownerAccount = privateKeyToAccount(OWNER_PRIVATE_KEY as `0x${string}`);
  const adminAccount = privateKeyToAccount(ADMIN_WALLET_TO_AUTHORIZE as `0x${string}`);

  console.log('🔐 Accounts:');
  console.log(`   Owner (caller): ${ownerAccount.address}`);
  console.log(`   Admin (to authorize): ${adminAccount.address}`);
  console.log(`   Contract: ${HAT_MINTER.trim()}\n`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account: ownerAccount,
    chain: base,
    transport: http(RPC_URL),
  });

  const hatMinter = getContract({
    address: HAT_MINTER.trim() as `0x${string}`,
    abi: HAT_MINTER_ABI,
    client: { public: publicClient, wallet: walletClient },
  });

  try {
    // Check current owner
    const contractOwner = await hatMinter.read.owner();
    console.log('🔍 Verification:');
    console.log(`   Contract owner: ${contractOwner}`);

    if (contractOwner.toLowerCase() !== ownerAccount.address.toLowerCase()) {
      console.error('\n❌ ERROR: You are not the contract owner');
      console.error(`   Expected: ${contractOwner}`);
      console.error(`   Got: ${ownerAccount.address}`);
      console.error('\n   You need to use the owner\'s private key\n');
      process.exit(1);
    }

    console.log('   ✅ Owner verified\n');

    // Check if already authorized
    const isAlreadyAuthorized = await hatMinter.read.isAuthorizedCaller([adminAccount.address]);

    if (isAlreadyAuthorized) {
      console.log('ℹ️  Admin wallet is already authorized!');
      console.log('   No action needed.\n');
      return;
    }

    // Authorize the caller
    console.log('📤 Authorizing admin wallet...\n');

    const hash = await hatMinter.write.setAuthorizedCaller([adminAccount.address, true]);

    console.log(`   ⏳ Transaction hash: ${hash}`);
    console.log('   Waiting for confirmation...\n');

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 60_000,
    });

    if (receipt.status !== 'success') {
      throw new Error('Authorization transaction failed');
    }

    // Verify authorization
    const isNowAuthorized = await hatMinter.read.isAuthorizedCaller([adminAccount.address]);

    console.log('✅ AUTHORIZATION COMPLETE!');
    console.log('───────────────────────────────────────────────────────────');
    console.log(`   Transaction: ${hash}`);
    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Authorized: ${isNowAuthorized ? '✅ Yes' : '❌ No'}\n`);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 NEXT STEPS');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('Your backend can now mint hats via the HatMinter contract!');
    console.log('Gas fees will be sponsored by Coinbase Paymaster.\n');
    console.log('Test the full onboarding flow:\n');
    console.log('  1. Clear cache: http://localhost:3000/?clear=true');
    console.log('  2. Complete wallet creation');
    console.log('  3. Hat should mint successfully (check console logs)\n');

  } catch (error) {
    console.error('❌ AUTHORIZATION FAILED:', error);
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
    }
    process.exit(1);
  }
}

authorize();
