// src/lib/podFinalize.ts
// Idempotent DB finalization for an activated pod. Shared by the pod review
// route (phase-2 dbUpdate) and the reconcile-pods cron, so a pod activated
// on-chain whose DB update never landed can always be repaired later.

import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export async function finalizePodActivation(params: {
  podId: string;
  managementHatId: string | null;
  podLeads: string[];
  actorAddress: string;
}): Promise<void> {
  const { podId, managementHatId, podLeads, actorAddress } = params;

  await supabaseAdmin
    .from('pods')
    .update({
      status: 'active',
      is_active: true,
      ...(managementHatId ? { management_hat_id: managementHatId } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', podId);

  if (!managementHatId) return;

  // Create pod_role_permissions so the permission system recognises pod leaders
  try {
    const { data: existing } = await supabaseAdmin
      .from('pod_role_permissions')
      .select('id')
      .eq('pod_id', podId)
      .eq('token_address', managementHatId)
      .single();

    // Upsert — overwrite any incomplete record written at creation time
    await supabaseAdmin.from('pod_role_permissions').upsert({
      ...(existing ? { id: existing.id } : {}),
      pod_id: podId,
      token_address: managementHatId,
      role_name: 'Pod Leader',
      permissions: {
        chatAccess: true,
        chatModeration: true,
        forumAccess: true,
        forumModeration: true,
        eventCreation: true,
        treasuryViewing: true,
        treasuryManagement: true,
        memberManagement: true,
        subPodCreation: true,
        roleAssignment: true,
        bountyManagement: true,
        marketplaceAccess: true,
        marketplaceManage: true,
        knowledgeBaseAccess: true,
        knowledgeBaseManage: true,
        governanceParticipation: true,
      },
      is_active: true,
      max_holders: 10,
      created_by: actorAddress,
      updated_by: actorAddress,
    }, { onConflict: 'pod_id,token_address' });
    console.log(`Upserted pod_role_permissions for pod ${podId}, hat ${managementHatId}`);
  } catch (roleErr: any) {
    // Non-fatal — pod is active, permissions can be set manually
    console.warn('Failed to create pod_role_permissions:', roleErr.message);
  }

  // Insert pod_members rows for all pod leads so the permission system
  // recognises them as leaders immediately (active_pod_members view reads this table)
  if (podLeads.length > 0) {
    try {
      const memberRows = podLeads.map((addr: string) => ({
        pod_id: podId,
        wallet: addr.toLowerCase(),
        membership_type: 'leader',
        role: 'leader',
        hat_id: managementHatId,
        is_active: true,
        joined_at: new Date().toISOString(),
      }));
      const { error: membersErr } = await supabaseAdmin
        .from('pod_members')
        .upsert(memberRows, { onConflict: 'pod_id,wallet', ignoreDuplicates: true });
      if (membersErr) console.warn('Failed to insert pod_members:', membersErr.message);
      else console.log(`Inserted ${memberRows.length} pod_members for pod ${podId}`);
    } catch (membersErr: any) {
      console.warn('Failed to insert pod_members:', membersErr.message);
    }
  }
}
