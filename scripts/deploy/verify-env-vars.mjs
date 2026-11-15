#!/usr/bin/env node
// Preflight for a deployment: every NEXT_PUBLIC_* variable that holds an
// address must point at deployed contract code on the configured chain.
// Catches typos, wrong-network addresses and EOAs pasted in place of contracts.
//
// Usage: node scripts/deploy/verify-env-vars.mjs
import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';

const chain = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '8453') === 84532 ? baseSepolia : base;
const client = createPublicClient({ chain, transport: http(process.env.NEXT_PUBLIC_RPC_URL || undefined) });

// Address-valued variables that are wallets, not contracts.
const NOT_CONTRACTS = new Set(['NEXT_PUBLIC_INVITE_BOOTSTRAP_WALLETS', 'NEXT_PUBLIC_SAFE_WALLET']);

const vars = Object.entries(process.env)
  .filter(([k, v]) => k.startsWith('NEXT_PUBLIC_') && !NOT_CONTRACTS.has(k) && /^0x[0-9a-fA-F]{40}$/.test((v || '').trim()))
  .sort(([a], [b]) => a.localeCompare(b));

console.log(`Checking ${vars.length} contract addresses on ${chain.name}...\n`);
let bad = 0;
for (const [k, v] of vars) {
  let code = '0x';
  try { code = (await client.getBytecode({ address: v.trim() })) || '0x'; } catch (e) { code = 'error'; }
  const ok = code !== '0x' && code !== 'error';
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'}  ${k.padEnd(44)} ${v.trim()}${code === 'error' ? '  (RPC error)' : ok ? '' : '  (no contract code)'}`);
}
console.log(bad ? `\n${bad} address(es) without contract code.` : '\nAll configured addresses have contract code.');
process.exit(bad ? 1 : 0);
