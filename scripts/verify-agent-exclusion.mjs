// scripts/verify-agent-exclusion.mjs
// Verifies the AgentExclusionEligibilityModule is attached to every live hat
// (IDs sourced from the DB, same as attach-agent-exclusion.mjs — no hardcoding).
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

const MODULE = '0x4a63a3f309242b0a6807be5a448fea4fa3c7e17e';
const HATS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
const KAIROS = '0x26e2fC58752b785fb9Ab3a315Db32BD4f81DD48a';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org', { batch: true }),
  batch: { multicall: true },
});

const HATS_ABI = parseAbi([
  'function viewHat(uint256) view returns (string details, uint32 maxSupply, uint32 supply, address eligibility, address toggle, string imageURI, uint16 lastHatId, bool mutable_, bool active)',
  'function isEligible(address wearer, uint256 hatId) view returns (bool)',
]);

const hats = new Map();
const { data: roles } = await supabase
  .from('pod_role_permissions').select('role_name, token_address').eq('is_active', true);
for (const r of roles ?? []) if (r.token_address?.startsWith('0x')) hats.set(r.token_address, r.role_name);
const { data: pods } = await supabase
  .from('pods').select('name, management_hat_id, membership_hat_id').eq('is_active', true);
for (const p of pods ?? []) {
  if (p.management_hat_id?.startsWith('0x')) hats.set(p.management_hat_id, `${p.name} (mgmt)`);
  if (p.membership_hat_id?.startsWith('0x')) hats.set(p.membership_hat_id, `${p.name} (member)`);
}

const entries = [...hats.entries()];
const views = await Promise.all(entries.map(([id]) =>
  client.readContract({ address: HATS, abi: HATS_ABI, functionName: 'viewHat', args: [BigInt(id)] }).catch(() => null)));
const kairosEligible = await Promise.all(entries.map(([id]) =>
  client.readContract({ address: HATS, abi: HATS_ABI, functionName: 'isEligible', args: [KAIROS, BigInt(id)] }).catch(() => null)));

let attached = 0;
entries.forEach(([id, name], i) => {
  if (!views[i]) { console.log(`⚠️  ${name}: viewHat failed (${id.slice(0, 20)}…)`); return; }
  const elig = views[i][3].toLowerCase();
  const ok = elig === MODULE;
  if (ok) attached++;
  const kairos = kairosEligible[i] === null ? '?' : kairosEligible[i] ? 'ELIGIBLE ✗' : 'ineligible ✓';
  console.log(`${ok ? '✅' : '❌'} ${name} (${id.slice(0, 20)}…): eligibility=${views[i][3]} | Kairos: ${kairos}`);
});
console.log(`\n${attached}/${entries.length} hats enforce agent exclusion.`);
