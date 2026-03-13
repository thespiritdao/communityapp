/**
 * airdrop-poc.mjs
 *
 * One-time script to batch mint Proof of Curiosity tokens to all beta testers.
 *
 * Usage:
 *   node scripts/airdrop-poc.mjs
 *
 * Requires in .env:
 *   POD_ADMIN_PRIVATE_KEY   — EOA that is an authorized minter on the PoC contract
 *   NEXT_PUBLIC_RPC_URL     — Base mainnet RPC
 *   POC_CONTRACT_ADDRESS    — Deployed ProofOfCuriosity contract address
 */

import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { readFileSync } from 'fs';
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
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const privateKey = process.env.POD_ADMIN_PRIVATE_KEY;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
  const contractAddress = process.env.POC_CONTRACT_ADDRESS;

  if (!privateKey) throw new Error('POD_ADMIN_PRIVATE_KEY not set in .env');
  if (!contractAddress) throw new Error('POC_CONTRACT_ADDRESS not set in .env');

  const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`);

  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

  console.log(`\n🚀 PoC Airdrop`);
  console.log(`   Minter:   ${account.address}`);
  console.log(`   Contract: ${contractAddress}`);
  console.log(`   Total:    ${RECIPIENTS.length} recipients\n`);

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

  console.log(`\n📦 Minting to ${needsMint.length} addresses...`);

  const { request } = await publicClient.simulateContract({
    address: contractAddress,
    abi: ABI,
    functionName: 'batchMint',
    args: [needsMint],
    account,
  });

  const txHash = await walletClient.writeContract(request);
  console.log(`\n⏳ Tx submitted: ${txHash}`);
  console.log(`   https://basescan.org/tx/${txHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`\n✅ Confirmed in block ${receipt.blockNumber}`);
  console.log(`   Status: ${receipt.status}`);

  // Verify
  console.log('\n🔎 Verifying...');
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
