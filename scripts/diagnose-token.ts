/**
 * Token Contract Diagnostic Script
 *
 * Checks if the SYSTEM token contract is properly deployed and functional
 */

import dotenv from 'dotenv';
import { createPublicClient, http, parseEther } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config();

const FAUCET_PRIVATE_KEY = process.env.PRIVATE_KEY;
const SYSTEM_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;
const SELF_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

// Test recipient (Tressa)
const TEST_RECIPIENT = '0xaecf4d00f0e402fbeb0757f22be9062d89018106';

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
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
] as const;

async function diagnoseToken(
  tokenAddress: `0x${string}`,
  tokenName: string,
) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 DIAGNOSING ${tokenName} TOKEN`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Address: ${tokenAddress}`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  try {
    // 1. Check if contract exists
    console.log('\n1️⃣ Checking if contract is deployed...');
    const code = await publicClient.getBytecode({ address: tokenAddress });

    if (!code || code === '0x') {
      console.error('❌ NO CONTRACT FOUND AT THIS ADDRESS!');
      console.error('   The contract may not be deployed or the address is wrong.');
      return false;
    }
    console.log('✅ Contract exists');

    // 2. Try to read basic token info
    console.log('\n2️⃣ Reading token metadata...');

    try {
      const name = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'name',
      });
      console.log(`   Name: ${name}`);
    } catch (error) {
      console.error('   ❌ Failed to read name()');
    }

    try {
      const symbol = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'symbol',
      });
      console.log(`   Symbol: ${symbol}`);
    } catch (error) {
      console.error('   ❌ Failed to read symbol()');
    }

    try {
      const decimals = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'decimals',
      });
      console.log(`   Decimals: ${decimals}`);
    } catch (error) {
      console.error('   ❌ Failed to read decimals()');
    }

    // 3. Check total supply
    console.log('\n3️⃣ Checking total supply...');
    try {
      const totalSupply = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'totalSupply',
      });
      console.log(`   Total Supply: ${totalSupply.toString()} wei`);
      console.log(`   Total Supply: ${Number(totalSupply) / 1e18} tokens`);
    } catch (error) {
      console.error('   ❌ Failed to read totalSupply()');
      console.error('   Error:', error);
    }

    // 4. Check faucet balance
    if (!FAUCET_PRIVATE_KEY) {
      console.log('\n4️⃣ Skipping faucet balance check (no PRIVATE_KEY)');
    } else {
      const account = privateKeyToAccount(FAUCET_PRIVATE_KEY as `0x${string}`);
      console.log(`\n4️⃣ Checking faucet balance: ${account.address}`);

      try {
        const balance = await publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [account.address],
        });
        console.log(`   Balance: ${balance.toString()} wei`);
        console.log(`   Balance: ${Number(balance) / 1e18} tokens`);

        if (balance === 0n) {
          console.error('   ⚠️  WARNING: Faucet has ZERO balance!');
        }
      } catch (error) {
        console.error('   ❌ Failed to read balanceOf()');
        console.error('   Error:', error);
      }
    }

    // 5. Try to simulate a transfer
    console.log('\n5️⃣ Simulating transfer (gas estimation)...');
    if (!FAUCET_PRIVATE_KEY) {
      console.log('   Skipping (no PRIVATE_KEY)');
    } else {
      const account = privateKeyToAccount(FAUCET_PRIVATE_KEY as `0x${string}`);

      try {
        const gas = await publicClient.estimateContractGas({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [TEST_RECIPIENT as `0x${string}`, parseEther('100')],
          account: account.address,
        });
        console.log(`   ✅ Gas estimate successful: ${gas.toString()} gas`);
        console.log(`   Transfer should work!`);
      } catch (error: any) {
        console.error('   ❌ TRANSFER WOULD FAIL!');
        console.error('   Error:', error.message || error);

        if (error.message?.includes('gas required exceeds allowance')) {
          console.error('\n   🔍 This error usually means:');
          console.error('      - Token contract has access control/restrictions');
          console.error('      - Faucet wallet is blacklisted');
          console.error('      - Contract is paused');
          console.error('      - Insufficient balance (despite what balanceOf says)');
        }
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    return true;
  } catch (error) {
    console.error('\n❌ Diagnostic failed:', error);
    return false;
  }
}

async function main() {
  console.log('🔍 TOKEN CONTRACT DIAGNOSTICS');
  console.log('='.repeat(60));
  console.log(`Network: Base Mainnet`);
  console.log(`RPC: ${RPC_URL}`);
  console.log('='.repeat(60));

  // Diagnose SYSTEM token
  const systemOk = await diagnoseToken(SYSTEM_TOKEN_ADDRESS, 'SYSTEM');

  // Diagnose SELF token
  const selfOk = await diagnoseToken(SELF_TOKEN_ADDRESS, 'SELF');

  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`SYSTEM Token: ${systemOk ? '✅ OK' : '❌ FAILED'}`);
  console.log(`SELF Token: ${selfOk ? '✅ OK' : '❌ FAILED'}`);
  console.log('='.repeat(60));

  process.exit(systemOk && selfOk ? 0 : 1);
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
