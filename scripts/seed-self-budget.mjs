/**
 * Seed / adjust a pod's $SELF mint budget for an epoch (Exec, Phase 1).
 *
 * Phase 1 uses manual Exec-set budgets (the algorithmic baseline is deferred to
 * Phase 4). This writes a pod_self_budgets row (capacity, not tokens). Re-running
 * for the same (pod, epoch) UPDATES the allocation.
 *
 * Usage:
 *   POD_ID=<uuid> EPOCH=<n> HOURS=<wholeHours> node scripts/seed-self-budget.mjs
 *   (optional) SOURCE=exec_petition  (default: algorithmic)
 *
 * HOURS is whole participation-hours; stored as wei (×1e18) to match on-chain.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const POD_ID = process.env.POD_ID;
const EPOCH = process.env.EPOCH;
const HOURS = process.env.HOURS;
const SOURCE = process.env.SOURCE || 'algorithmic';

function fail(msg) { console.error('❌', msg); process.exit(1); }

if (!POD_ID) fail('POD_ID required (pods.id UUID)');
if (EPOCH === undefined) fail('EPOCH required (integer, matches SelfEpochs.currentEpoch)');
if (!HOURS) fail('HOURS required (whole participation-hours)');

const epoch = Number(EPOCH);
const allocatedWei = (BigInt(HOURS) * (10n ** 18n)).toString();

const { data: pod } = await supabase.from('pods').select('id, name').eq('id', POD_ID).maybeSingle();
if (!pod) fail(`Pod ${POD_ID} not found`);

const { error } = await supabase
  .from('pod_self_budgets')
  .upsert(
    {
      pod_id: POD_ID,
      epoch,
      allocated_hours: allocatedWei,
      source: SOURCE,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'pod_id,epoch' },
  );
if (error) fail(`Upsert failed: ${error.message}`);

console.log(`✅ Budget set: pod "${pod.name}" epoch ${epoch} → ${HOURS}h (source: ${SOURCE})`);
console.log(`   (minted_hours preserved if row already existed)`);
