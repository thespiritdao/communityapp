/**
 * Pod leader invitations. Server-side only.
 *
 * Nobody becomes a pod leader without accepting. An invitation is a
 * pod_membership_applications row with intended_role 'leader' and status
 * 'invited', carrying the inviting leader's vote. When the invitee accepts,
 * it is approved if the votes already reach the majority rule (half the
 * current leaders, rounded up — the same rule the database enforces on leader
 * applications), otherwise it becomes 'pending' and the other leaders vote.
 * See migration 20261001000001_leader_invitations.sql.
 */

import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { sendServerNotificationBatch } from '@/lib/serverNotifications';
import { invalidatePodAuthority } from '@/lib/podAuthority';

const ADDRESS_RE = /^0x[a-f0-9]{40}$/;

/** pods.pod_leads ∪ created_by_address, lowercased (mirrors pod_current_leaders()). */
export async function currentPodLeaders(podId: string): Promise<{ name: string; leaders: string[] } | null> {
  const { data: pod } = await supabaseAdmin
    .from('pods')
    .select('name, pod_leads, created_by_address')
    .eq('id', podId)
    .maybeSingle();
  if (!pod) return null;
  const set = new Set<string>();
  for (const l of (pod.pod_leads as string[] | null) ?? []) if (l) set.add(l.toLowerCase());
  if (pod.created_by_address) set.add(String(pod.created_by_address).toLowerCase());
  return { name: pod.name as string, leaders: [...set] };
}

export function votesNeeded(leaderCount: number): number {
  return Math.max(Math.ceil(leaderCount / 2), 1);
}

export function countLeaderVotes(votingLeaders: string[] | null, leaders: string[]): number {
  const votes = new Set((votingLeaders ?? []).map((v) => v.toLowerCase()));
  return leaders.filter((l) => votes.has(l)).length;
}

export interface InviteResult {
  invited: string[];
  skipped: { address: string; reason: string }[];
}

/**
 * Invite addresses to co-lead a pod. The caller must already have checked
 * that `inviter` leads the pod.
 */
export async function createLeaderInvites(
  podId: string,
  inviter: string,
  addresses: string[],
): Promise<InviteResult> {
  const result: InviteResult = { invited: [], skipped: [] };
  const pod = await currentPodLeaders(podId);
  if (!pod) throw new Error('Pod not found');
  const inviterLc = inviter.toLowerCase();

  const unique = [...new Set(addresses.map((a) => String(a || '').trim().toLowerCase()).filter(Boolean))];
  for (const address of unique) {
    if (!ADDRESS_RE.test(address)) {
      result.skipped.push({ address, reason: 'not a wallet address' });
      continue;
    }
    if (pod.leaders.includes(address)) {
      result.skipped.push({ address, reason: 'already a leader' });
      continue;
    }
    const { data: open } = await supabaseAdmin
      .from('pod_membership_applications')
      .select('id, status')
      .eq('pod_id', podId)
      .eq('applicant_address', address)
      .eq('intended_role', 'leader')
      .in('status', ['invited', 'pending'])
      .limit(1);
    if (open && open.length > 0) {
      result.skipped.push({ address, reason: open[0].status === 'invited' ? 'already invited' : 'leader application already open' });
      continue;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from('pod_membership_applications').insert({
      pod_id: podId,
      applicant_address: address,
      intended_role: 'leader',
      status: 'invited',
      voting_leaders: [inviterLc],
      current_votes: 1,
      required_votes: votesNeeded(pod.leaders.length),
      agreement_signature: 'leader-invitation',
      accountability_statement: `Invited to co-lead ${pod.name} by ${inviterLc}`,
      metadata: { kind: 'leader_invite', invited_by: inviterLc, invited_at: now },
      submitted_at: now,
    });
    if (error) {
      result.skipped.push({ address, reason: error.message });
      continue;
    }
    result.invited.push(address);
  }

  if (result.invited.length > 0) {
    await sendServerNotificationBatch(
      result.invited.map((address) => ({
        recipient_address: address,
        sender_address: inviterLc,
        notification_type: 'pod_leadership_invitation',
        title: `You're invited to co-lead ${pod.name}`,
        message: `You've been invited to become a leader of ${pod.name}. Open the pod to accept or decline.`,
        context_url: `/pods/${podId}`,
        context_type: 'pod',
        context_id: podId,
        priority: 'high',
      })),
    );
  }
  return result;
}

export type RespondOutcome = 'leader' | 'awaiting_votes' | 'declined';

/**
 * The invitee accepts or declines. `inviteeWallets` are all of the caller's
 * wallets; the invitation must be addressed to one of them.
 */
export async function respondToLeaderInvite(
  podId: string,
  inviteId: string,
  inviteeWallets: string[],
  accept: boolean,
): Promise<{ outcome: RespondOutcome } | { error: string; status: number }> {
  const { data: invite } = await supabaseAdmin
    .from('pod_membership_applications')
    .select('id, pod_id, applicant_address, status, intended_role, voting_leaders, metadata')
    .eq('id', inviteId)
    .maybeSingle();
  const invitee = String(invite?.applicant_address ?? '').toLowerCase();
  if (!invite || invite.pod_id !== podId || invite.intended_role !== 'leader') {
    return { error: 'Invitation not found', status: 404 };
  }
  if (!inviteeWallets.map((w) => w.toLowerCase()).includes(invitee)) {
    return { error: 'This invitation is for someone else', status: 403 };
  }
  if (invite.status !== 'invited') {
    return { error: 'This invitation has already been answered', status: 409 };
  }

  const pod = await currentPodLeaders(podId);
  if (!pod) return { error: 'Pod not found', status: 404 };
  const invitedBy = String((invite.metadata as Record<string, unknown> | null)?.invited_by ?? '');

  if (!accept) {
    await supabaseAdmin.from('pod_membership_applications').delete().eq('id', inviteId);
    if (invitedBy) {
      await sendServerNotificationBatch([{
        recipient_address: invitedBy,
        sender_address: invitee,
        notification_type: 'pod_application_status',
        title: `Leadership invitation declined`,
        message: `Your invitation to co-lead ${pod.name} was declined.`,
        context_url: `/pods/${podId}`,
        context_type: 'pod',
        context_id: podId,
      }]);
    }
    return { outcome: 'declined' };
  }

  const now = new Date().toISOString();
  const votes = countLeaderVotes(invite.voting_leaders as string[] | null, pod.leaders);
  const needed = votesNeeded(pod.leaders.length);
  const accepted = { ...(invite.metadata as Record<string, unknown> | null ?? {}), accepted_at: now };

  if (votes >= needed) {
    const { error } = await supabaseAdmin
      .from('pod_membership_applications')
      .update({ status: 'approved', approved_at: now, required_votes: needed, metadata: accepted })
      .eq('id', inviteId);
    if (error) return { error: error.message, status: 500 };

    const { data: row } = await supabaseAdmin.from('pods').select('pod_leads').eq('id', podId).maybeSingle();
    const leads = ((row?.pod_leads as string[] | null) ?? []).map((l) => l.toLowerCase());
    if (!leads.includes(invitee)) {
      await supabaseAdmin.from('pods').update({ pod_leads: [...leads, invitee] }).eq('id', podId);
    }
    invalidatePodAuthority(invitee, podId);

    await sendServerNotificationBatch(
      pod.leaders.map((leader) => ({
        recipient_address: leader,
        sender_address: invitee,
        notification_type: 'pod_application_status',
        title: `New co-leader for ${pod.name}`,
        message: `Your leadership invitation was accepted. They are now a leader of ${pod.name}.`,
        context_url: `/pods/${podId}`,
        context_type: 'pod',
        context_id: podId,
      })),
    );
    return { outcome: 'leader' };
  }

  const { error } = await supabaseAdmin
    .from('pod_membership_applications')
    .update({ status: 'pending', required_votes: needed, metadata: accepted })
    .eq('id', inviteId);
  if (error) return { error: error.message, status: 500 };

  await sendServerNotificationBatch(
    pod.leaders
      .filter((l) => !(invite.voting_leaders as string[] | null ?? []).map((v) => v.toLowerCase()).includes(l))
      .map((leader) => ({
        recipient_address: leader,
        sender_address: invitee,
        notification_type: 'pod_application_status',
        title: `Vote on a new co-leader for ${pod.name}`,
        message: `A leadership invitation was accepted and needs ${needed - votes} more leader vote(s).`,
        context_url: `/pods/${podId}`,
        context_type: 'pod',
        context_id: podId,
      })),
  );
  return { outcome: 'awaiting_votes' };
}
