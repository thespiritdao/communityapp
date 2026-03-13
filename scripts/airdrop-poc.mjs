/**
 * airdrop-poc.mjs
 *
 * One-time script to batch mint Proof of Curiosity tokens to all beta testers.
 * Uses CDP smart wallet + Coinbase paymaster — fully gasless.
 *
 * Usage:
 *   node scripts/airdrop-poc.mjs
 *
 * Requires in .env:
 *   POD_ADMIN_PRIVATE_KEY       — EOA owner/signer of the CDP smart wallet
 *   CDP_API_KEY                 — Coinbase CDP API key name
 *   EXECUTIVE_MINTING_PRIVATE_KEY — CDP API private key (PEM)
 *   NEXT_PUBLIC_PAYMASTER       — Coinbase paymaster URL
 *   NEXT_PUBLIC_RPC_URL         — Base mainnet RPC
 *   POC_CONTRACT_ADDRESS        — Deployed ProofOfCuriosity contract address
 */

import { createPublicClient, http, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { Coinbase, toSmartWallet, sendUserOperation, waitForUserOperation } from '@coinbase/coinbase-sdk';
import { config } from 'dotenv';

config({ path: '.env' });

// ── Recipients ────────────────────────────────────────────────────────────────

const RECIPIENTS = [
  '0x8a23bde6b8a1832cd7119daed4a794027d74e71e',
  '0x756ca890351de391ea3646cb354bf4d943a63f6f',
  '0x62421b696132bb635feba0e3cb2f305637cb7ead',
  '0xdfb6614e9de3822e13de08c6b050a448d417b2d6',
  '0x46d6665a4506d9e0519e78dcf7922356df880561',
  '0x02b325d6868b9d53866eb1af9a795a181924204b',
  '0x61b32ef6fa936793ef73c01bbc5e244db4b49ce2',
  '0xe3ddfd2b214d51316533181248a4106f83e4934c',
  '0xd0ad866ce9f8200268ffdea6a0550007090814cf',
  '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48',
  '0x19774ac45aa52558967c302f4c11deb60f9ae4c6',
  '0x24833d14dea3fd4a7d5bc269e1be533aab8b37c0',
  '0xaecf4d00f0e402fbeb0757f22be9062d89018106',
  '0x3b2d43b6ceb14bedc590a61bc8e576c5eb635d16',
  '0x21498071d1a52830fa398937a9a8f59c69d3fa7a',
  '0x0259c4b65866d8f9e596052dbcdfc142c28b6329',
  '0xaff63f73347a6cbfa869f6fc5b47f8e0ee676f22',
  '0xd148b96e3e6ff396e4d9acf3946627060e9561a8',
  '0xbe03115945680f518e53c4473e0e077ec7272923',
  '0x40092763d122b7bc91adfcc57211d3cc8d46dbb5',
  '0xa866720839879b4aef18bceb7925d72461a35279',
  '0x0101caccc16fdac093d3a9878a1aa060f5c30bc1',
  '0xd07aba1caeff9843389a8d0da2359287159d2cad',
];

// ── ABI ───────────────────────────────────────────────────────────────────────

const ABI = [
  {
    name: 'batchMint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'recipients', type: 'address[]' }],
    outputs: [{ name: 'successCount', type: 'uint256' }],
  },
  {
    name: 'hasToken',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const privateKey = process.env.POD_ADMIN_PRIVATE_KEY;
  const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
  const contractAddress = process.env.POC_CONTRACT_ADDRESS;
  const cdpApiKey = process.env.CDP_API_KEY;
  let cdpPrivateKey = process.env.EXECUTIVE_MINTING_PRIVATE_KEY;

  if (!privateKey) throw new Error('POD_ADMIN_PRIVATE_KEY not set in .env');
  if (!paymasterUrl) throw new Error('NEXT_PUBLIC_PAYMASTER not set in .env');
  if (!contractAddress) throw new Error('POC_CONTRACT_ADDRESS not set in .env');
  if (!cdpApiKey) throw new Error('CDP_API_KEY not set in .env');
  if (!cdpPrivateKey) throw new Error('EXECUTIVE_MINTING_PRIVATE_KEY not set in .env');

  // Normalize PEM newlines (Vercel/dotenv may store literal \n)
  if (cdpPrivateKey.includes('\\n')) cdpPrivateKey = cdpPrivateKey.replace(/\\n/g, '\n');

  // Initialize CDP SDK (required for sendUserOperation + waitForUserOperation)
  Coinbase.configure({ apiKeyName: cdpApiKey, privateKey: cdpPrivateKey });

  // Reconstruct the existing CDP smart wallet — address is deterministic
  const signer = privateKeyToAccount(
    privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
  );
  const wallet = toSmartWallet({
    smartWalletAddress: '0x05c06af9fe1a996144902D9571d1d2783866cF63',
    signer,
  });

  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });

  console.log(`\n🚀 PoC Airdrop (gasless via CDP paymaster)`);
  console.log(`   Smart wallet: ${wallet.address}`);
  console.log(`   Signer EOA:   ${signer.address}`);
  console.log(`   Contract:     ${contractAddress}`);
  console.log(`   Total:        ${RECIPIENTS.length} recipients\n`);

  // Pre-check: filter out addresses that already hold a token
  console.log('🔍 Checking existing holdings...');
  const needsMint = [];
  for (const addr of RECIPIENTS) {
    const has = await publicClient.readContract({
      address: contractAddress,
      abi: ABI,
      functionName: 'hasToken',
      args: [addr],
    });
    if (has) {
      console.log(`  ⏭  ${addr} — already holds token, skipping`);
    } else {
      needsMint.push(addr);
    }
  }

  if (needsMint.length === 0) {
    console.log('\n✅ All recipients already hold tokens. Nothing to do.');
    return;
  }

  console.log(`\n📦 Minting to ${needsMint.length} addresses (gasless)...`);

  const callData = encodeFunctionData({
    abi: ABI,
    functionName: 'batchMint',
    args: [needsMint],
  });

  const result = await sendUserOperation(wallet, {
    calls: [{ to: contractAddress, data: callData, value: 0n }],
    chainId: 8453, // Base mainnet
    paymasterUrl,
  });

  console.log(`\n⏳ UserOp submitted: ${result.userOpHash}`);
  console.log(`   Waiting for on-chain confirmation...`);

  const receipt = await waitForUserOperation({
    userOpHash: result.userOpHash,
    smartWalletAddress: wallet.address,
  });

  const txHash = receipt.transaction_hash || result.userOpHash;
  console.log(`\n✅ Confirmed!`);
  if (receipt.transaction_hash) {
    console.log(`   Tx: https://basescan.org/tx/${receipt.transaction_hash}`);
  }

  // Verify
  console.log('\n🔎 Verifying on-chain...');
  let minted = 0;
  for (const addr of needsMint) {
    const has = await publicClient.readContract({
      address: contractAddress,
      abi: ABI,
      functionName: 'hasToken',
      args: [addr],
    });
    console.log(`  ${has ? '✅' : '❌'} ${addr}`);
    if (has) minted++;
  }

  console.log(`\n🎉 Done — ${minted}/${needsMint.length} tokens confirmed on-chain.`);
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message || err);
  process.exit(1);
});
