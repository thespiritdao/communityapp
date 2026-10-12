// src/lib/disputeAccess.ts
// Who may read a bounty dispute (and its evidence): the parties, an active
// mediator, a leader of the bounty's pod, the bounty creator, or an
// Executive Leader. SERVER ONLY (service-role client).

import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { isExecutiveLeader, isPodLeader } from '@/lib/serverPodAuth';

export interface DisputeRow {
  id: string;
  bounty_id?: string | null;
  filed_by?: string | null;
  filed_against?: string | null;
}

export async function canViewDispute(
  dispute: DisputeRow,
  wallet: string,
): Promise<boolean> {
  const w = wallet.toLowerCase();
  if (
    (dispute.filed_by || '').toLowerCase() === w ||
    (dispute.filed_against || '').toLowerCase() === w
  ) {
    return true;
  }

  const { data: mediator } = await supabaseAdmin
    .from('dispute_mediators')
    .select('id')
    .eq('dispute_id', dispute.id)
    .eq('mediator_address', w)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (mediator) return true;

  if (dispute.bounty_id) {
    const { data: bounty } = await supabaseAdmin
      .from('bounties')
      .select('pod_id, creator_address')
      .eq('id', dispute.bounty_id)
      .maybeSingle();
    if ((bounty?.creator_address || '').toLowerCase() === w) return true;
    if (bounty?.pod_id && (await isPodLeader(bounty.pod_id, w))) return true;
  }

  return isExecutiveLeader(w);
}
