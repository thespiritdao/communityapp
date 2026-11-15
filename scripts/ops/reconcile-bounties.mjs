#!/usr/bin/env node
// scripts/ops/reconcile-bounties.mjs — recover bounties that exist on-chain but
// have no row in the database.
//
//   node scripts/ops/reconcile-bounties.mjs                 # report only, last ~12h
//   node scripts/ops/reconcile-bounties.mjs --apply         # insert the missing rows
//   node scripts/ops/reconcile-bounties.mjs --hours 48 --apply
//   node scripts/ops/reconcile-bounties.mjs --creator 0x... --apply
//
// Why this exists: createBounty succeeds on-chain and the app then POSTs the
// record to /api/bounty/create. If that POST fails (expired session, network
// drop, tab closed), the escrow is locked in the contract but the bounty is
// invisible in the app. This scans BountyCreated events, compares them with
// `bounties.onchain_id`, and rebuilds the missing rows from on-chain state plus
// the pinned IPFS metadata.
//
// Read-only unless --apply is passed.

import nextEnv from '@next/env';
import { createPublicClient, http, parseAbiItem, parseAbi, formatEther } from 'viem';
import { base } from 'viem/chains';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const HOURS = Number(args[args.indexOf('--hours') + 1]) || 12;
const CREATOR = args.includes('--creator') ? args[args.indexOf('--creator') + 1].toLowerCase() : null;

const BM = (process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS || '').toLowerCase();
if (!BM) { console.error('Set NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS'); process.exit(1); }
const SYSTEM = (process.env.NEXT_PUBLIC_SYSTEM_TOKEN || '').toLowerCase();
const RPC = 'https://mainnet.base.org';
const WINDOW = 2000n; // public RPC getLogs range cap

const client = createPublicClient({ chain: base, transport: http(RPC, { retryCount: 4, retryDelay: 2000 }) });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const createdEvent = parseAbiItem(
  'event BountyCreated(uint256 indexed bountyId, address indexed creator, string podId, string ipfsHash)',
);
const bmAbi = parseAbi([
  'function bounties(uint256) view returns (address creator,uint128 value,uint64 createdAt,uint64 deadline,address token,address fundingSource,uint8 status,uint8 paymentType,bool isEscrowed,string podId,string category)',
]);

const STATUS = ['open', 'assigned', 'completed', 'cancelled'];

// Mirrors src/lib/ipfsFetch.ts: authenticated Pinata first (the public
// gateways now rate-limit or hang), then a trustless gateway.
async function fetchMetadata(hash) {
  if (!hash || hash.startsWith('temp_')) return null;
  const jwt = process.env.PINATA_JWT;
  const attempts = [
    jwt && { url: `https://gateway.pinata.cloud/ipfs/${hash}`, headers: { Authorization: `Bearer ${jwt}` } },
    { url: `https://trustless-gateway.link/ipfs/${hash}?format=raw`, headers: {} },
    { url: `https://ipfs.io/ipfs/${hash}`, headers: {} },
  ].filter(Boolean);
  for (const a of attempts) {
    try {
      const res = await fetch(a.url, { headers: a.headers, signal: AbortSignal.timeout(10000) });
      if (res.ok) return JSON.parse(await res.text());
    } catch {
      /* try next gateway */
    }
  }
  return null;
}

async function main() {
  const latest = await client.getBlockNumber();
  const span = BigInt(Math.ceil((HOURS * 3600) / 2)); // Base ≈ 2s blocks
  const floor = latest - span;
  console.log(`Scanning BountyCreated on ${BM} — last ~${HOURS}h (blocks ${floor}..${latest})`);
  if (CREATOR) console.log(`Filtering creator ${CREATOR}`);

  const events = [];
  for (let end = latest; end > floor; end -= WINDOW) {
    const start = end - (WINDOW - 1n) > floor ? end - (WINDOW - 1n) : floor;
    try {
      const logs = await client.getLogs({
        address: BM,
        event: createdEvent,
        ...(CREATOR ? { args: { creator: CREATOR } } : {}),
        fromBlock: start,
        toBlock: end,
      });
      events.push(...logs);
    } catch (e) {
      console.warn(`  range ${start}-${end} failed: ${(e.shortMessage || e.message).slice(0, 70)}`);
    }
  }
  console.log(`Found ${events.length} BountyCreated event(s)\n`);

  let missing = 0, inserted = 0;
  for (const log of events.sort((a, b) => Number(a.args.bountyId - b.args.bountyId))) {
    const onchainId = log.args.bountyId.toString();
    const { data: existing } = await sb
      .from('bounties')
      .select('id, status')
      .eq('onchain_id', onchainId)
      .maybeSingle();
    if (existing) {
      console.log(`#${onchainId} present in DB (${existing.status})`);
      continue;
    }
    missing++;

    const b = await client.readContract({ address: BM, abi: bmAbi, functionName: 'bounties', args: [log.args.bountyId] });
    const [creator, value, createdAt, deadline, token, fundingSource, status, , , podId, category] = b;
    const meta = await fetchMetadata(log.args.ipfsHash);
    const isTreasury = fundingSource.toLowerCase() !== creator.toLowerCase();

    const row = {
      title: meta?.title || `Recovered bounty #${onchainId}`,
      description: meta?.description || 'Recovered from on-chain state; the original submission was not saved.',
      category: meta?.category || category || 'General',
      value_amount: formatEther(value),
      value_token: token.toLowerCase() === SYSTEM ? 'SYSTEM' : 'SELF',
      requirements: meta?.requirements || [],
      tasks: meta?.tasks || [],
      questions: meta?.questions || [],
      status: STATUS[status] || 'open',
      creator_address: creator.toLowerCase(),
      estimated_hours: Math.max(0, Number(meta?.estimatedHours ?? meta?.estimated_hours) || 0),
      created_at: new Date(Number(createdAt) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      blockchain_id: onchainId,
      onchain_id: onchainId,
      transaction_hash: log.transactionHash,
      pod_id: podId,
      required_pod_id: podId,
      ipfs_hash: log.args.ipfsHash,
      funding_source: isTreasury ? 'pod_treasury' : 'wallet',
      payment_type: 'completion',
      deadline: Number(deadline) > 0 ? new Date(Number(deadline) * 1000).toISOString() : null,
    };

    console.log(`#${onchainId} MISSING → ${row.title} | ${row.value_amount} $${row.value_token} | ${row.funding_source} | pod ${podId.slice(0, 8)} | metadata:${meta ? 'ok' : 'unavailable'}`);

    if (APPLY) {
      const { error } = await sb.from('bounties').insert(row);
      if (error) console.error(`   ✗ insert failed: ${error.message}`);
      else { inserted++; console.log('   ✓ inserted'); }
    }
  }

  console.log(`\n${missing} missing. ${APPLY ? `${inserted} inserted.` : 'Re-run with --apply to insert.'}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
