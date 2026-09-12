// src/app/bounty/dispute/[disputeId]/page.tsx
//
// Dispute notifications link to /bounty/dispute/<disputeId>, a route that never
// existed. Disputes are read from inside the disputed bounty's detail panel, so
// resolve the dispute to its bounty and open that. A dispute id we can't
// resolve falls back to the bounty list rather than a 404.

import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export default async function DisputeRedirect({
  params,
}: {
  params: Promise<{ disputeId: string }>;
}) {
  const { disputeId } = await params;

  let bountyId: string | null = null;
  try {
    const { data } = await supabaseAdmin
      .from('bounty_disputes')
      .select('bounty_id')
      .eq('id', disputeId)
      .maybeSingle();
    bountyId = data?.bounty_id ?? null;
  } catch {
    bountyId = null;
  }

  redirect(bountyId ? `/bounty?bounty=${encodeURIComponent(bountyId)}` : '/bounty');
}
