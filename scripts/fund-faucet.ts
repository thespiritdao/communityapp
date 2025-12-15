/**
 * Fund Token Faucet
 *
 * Transfers tokens from faucet wallet to the TokenFaucet contract.
 *
 * Usage:
 *   npx tsx scripts/fund-faucet.ts
 */

import dotenv from 'dotenv';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config();

const FAUCET_PRIVATE_KEY = process.env.PRIVATE_KEY;
const SYSTEM_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;
const SELF_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;
const TOKEN_FAUCET_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_FAUCET as `0x${string}`;
const RPC_URL = 'https://mainnet.base.org';

// Fund amounts (1000 tokens = enough for 100 claims)
const SYSTEM_FUND_AMOUNT = 1000;
const SELF_FUND_AMOUNT = 1000;

const ERC20_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

async function main() {
  if (!FAUCET_PRIVATE_KEY) {
    throw new Error('Missing PRIVATE_KEY in .env');
  }

  if (!TOKEN_FAUCET_ADDRESS) {
    throw new Error('Missing NEXT_PUBLIC_TOKEN_FAUCET in .env - deploy contract first');
  }

  const account = privateKeyToAccount(FAUCET_PRIVATE_KEY as `0x${string}`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(RPC_URL),
  });

  console.log('💰 Funding Token Faucet');
  console.log('='.repeat(60));
  console.log(`Faucet Contract: ${TOKEN_FAUCET_ADDRESS}`);
  console.log(`From Wallet: ${account.address}`);
  console.log(`SYSTEM Amount: ${SYSTEM_FUND_AMOUNT} tokens`);
  console.log(`SELF Amount: ${SELF_FUND_AMOUNT} tokens`);
  console.log('='.repeat(60));
  console.log('');

  // Check balances
  console.log('📊 Checking wallet balances...');
  const systemBalance = await publicClient.readContract({
    address: SYSTEM_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });

  const selfBalance = await publicClient.readContract({
    address: SELF_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });

  console.log(`  SYSTEM: ${formatEther(systemBalance)} tokens`);
  console.log(`  SELF: ${formatEther(selfBalance)} tokens`);
  console.log('');

  // Verify sufficient balance
  const systemFundAmount = parseEther(SYSTEM_FUND_AMOUNT.toString());
  const selfFundAmount = parseEther(SELF_FUND_AMOUNT.toString());

  if (systemBalance < systemFundAmount) {
    throw new Error(`Insufficient SYSTEM tokens. Need ${SYSTEM_FUND_AMOUNT}, have ${formatEther(systemBalance)}`);
  }

  if (selfBalance < selfFundAmount) {
    throw new Error(`Insufficient SELF tokens. Need ${SELF_FUND_AMOUNT}, have ${formatEther(selfBalance)}`);
  }

  console.log('✅ Sufficient balance available');
  console.log('');

  // Transfer SYSTEM tokens
  console.log('📤 Transferring SYSTEM tokens...');
  const systemHash = await walletClient.writeContract({
    address: SYSTEM_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [TOKEN_FAUCET_ADDRESS, systemFundAmount],
  });

  console.log(`   Transaction: ${systemHash}`);
  console.log('   Waiting for confirmation...');
  await publicClient.waitForTransactionReceipt({ hash: systemHash });
  console.log('   ✅ SYSTEM tokens transferred!');
  console.log('');

  // Transfer SELF tokens
  console.log('📤 Transferring SELF tokens...');
  const selfHash = await walletClient.writeContract({
    address: SELF_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [TOKEN_FAUCET_ADDRESS, selfFundAmount],
  });

  console.log(`   Transaction: ${selfHash}`);
  console.log('   Waiting for confirmation...');
  await publicClient.waitForTransactionReceipt({ hash: selfHash });
  console.log('   ✅ SELF tokens transferred!');
  console.log('');

  // Verify faucet balances
  console.log('📊 Verifying faucet balances...');
  const faucetSystemBalance = await publicClient.readContract({
    address: SYSTEM_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [TOKEN_FAUCET_ADDRESS],
  });

  const faucetSelfBalance = await publicClient.readContract({
    address: SELF_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [TOKEN_FAUCET_ADDRESS],
  });

  console.log(`  SYSTEM: ${formatEther(faucetSystemBalance)} tokens`);
  console.log(`  SELF: ${formatEther(faucetSelfBalance)} tokens`);
  console.log('');

  const claimsAvailable = Math.min(
    Number(formatEther(faucetSystemBalance)) / 10,
    Number(formatEther(faucetSelfBalance)) / 10
  );

  console.log(`💡 Faucet can support ~${Math.floor(claimsAvailable)} claims (10 tokens each)`);
  console.log('');
  console.log('='.repeat(60));
  console.log('✅ Faucet funding complete!');
  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});
