/**
 * Role-service $SELF stipend sweep (Exec, per epoch).
 *
 * This is the canonical RECURRING manual task: at/near epoch close, credit
 * active role-holders a participation stipend for serving. Not event-driven, so
 * it's a sweep, not an inline trigger. Run once per pod per epoch (idempotent:
 * the queue source_ref is `role:<wallet>:<podHat>:<epoch>`, so re-running is a
 * no-op for already-queued members).
 *
 * Phase 1: Exec sets the stipend rate per run (no algorithmic config yet).
 * Credits leaders/admins by default (membership_type in leader/admin); pass
 * SCOPE=all to credit every active member.
 *
 * Usage:
 *   POD_ID=<uuid> EPOCH=<n> STIPEND_HOURS=<wholeHours> node scripts/role-service-stipend.mjs
 *   (optional) SCOPE=all          (default: leaders+admins only)
 *
 * Queues rows only — run /api/self/mint-batch afterward to mint them.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, keccak256, toBytes, parseAbi } from 'viem';
import { base } from 'viem/chains';

function fail(m) { console.error('❌', m); process.exit(1); }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const POD_ID = process.env.POD_ID;
const EPOCH = process.env.EPOCH;
const STIPEND_HOURS = process.env.STIPEND_HOURS;
const SCOPE = process.env.SCOPE || 'leaders';

if (!POD_ID) fail('POD_ID required');
if (EPOCH === undefined) fail('EPOCH required');
if (!STIPEND_HOURS) fail('STIPEND_HOURS required (whole hours)');

const epoch = Number(EPOCH);
const stipendWei = BigInt(STIPEND_HOURS) * 10n ** 18n;

// Canonical pod → communityId (must match src/features/self/lib/communityId.ts).
const MASK_224 = (1n << 224n) - 1n;
const communityId = (BigInt(keccak256(toBytes(POD_ID.toLowerCase()))) & MASK_224).toString();

// Verify a budget exists (the mint will be capped by it anyway).
const { data: budget } = await supabase
  .from('pod_self_budgets').select('allocated_hours, minted_hours')
  .eq('pod_id', POD_ID).eq('epoch', epoch).maybeSingle();
if (!budget) fail(`No budget for pod ${POD_ID} epoch ${epoch} — seed one first`);

// Active role-holders for this pod.
let q = supabase
  .from('active_pod_members')
  .select('wallet, hat_id, membership_type')
  .eq('pod_id', POD_ID);
if (SCOPE !== 'all') q = q.in('membership_type', ['leader', 'admin']);
const { data: members, error } = await q;
if (error) fail(`Member query failed: ${error.message}`);
if (!members || members.length === 0) fail('No matching active role-holders');

console.log(`Crediting ${members.length} role-holder(s) ${STIPEND_HOURS}h each (pod ${POD_ID}, epoch ${epoch}, scope ${SCOPE})`);

let queued = 0, skipped = 0;
for (const m of members) {
  const wallet = m.wallet.toLowerCase();
  const sourceRef = `role:${wallet}:${m.hat_id || 'na'}:${epoch}`;
  // Idempotency check (mirrors queueEarning's unique constraint).
  const { data: existing } = await supabase
    .from('self_mint_queue').select('id')
    .eq('source_type', 'role_service').eq('source_ref', sourceRef).eq('wallet', wallet)
    .maybeSingle();
  if (existing) { skipped++; continue; }

  const { error: insErr } = await supabase.from('self_mint_queue').insert({
    wallet, pod_id: POD_ID, community_id: communityId, epoch,
    hours: stipendWei.toString(), raw_hours: stipendWei.toString(),
    source_type: 'role_service', source_ref: sourceRef, status: 'pending',
    anomaly_flags: [],
  });
  if (insErr) {
    if (insErr.code === '23505') { skipped++; continue; }
    console.error(`  ⚠️ ${wallet}: ${insErr.message}`);
    continue;
  }
  // Bump member running total (drives diminishing returns).
  const { data: earned } = await supabase
    .from('self_member_epoch_earned').select('hours')
    .eq('wallet', wallet).eq('pod_id', POD_ID).eq('epoch', epoch).maybeSingle();
  const prev = earned?.hours ? BigInt(earned.hours) : 0n;
  await supabase.from('self_member_epoch_earned').upsert(
    { wallet, pod_id: POD_ID, epoch, hours: (prev + stipendWei).toString(), updated_at: new Date().toISOString() },
    { onConflict: 'wallet,pod_id,epoch' },
  );
  queued++;
}

console.log(`✅ Stipend sweep done: ${queued} queued, ${skipped} already-present. Run /api/self/mint-batch to mint.`);
