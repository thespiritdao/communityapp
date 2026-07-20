// POST /api/pod-invites/accept — redeem a pod invite link.
// Auth: any authenticated member (JWT). Grants DB membership immediately
// (chat/forum/events unlock now); the on-chain member hat is queued for a
// leader's gasless batch-mint (Option A in the spec).
//
// Eligibility: if the granted role has non-agreement eligibility criteria
// (e.g. TreeGens' $TGN minimum), they are STILL ENFORCED — a link is an
// invitation, not an exemption. Agreements are signed after joining, on the
// pod page, exactly as with the application flow.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { getWalletFromRequest } from '@/lib/serverPodAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const wallet = getWalletFromRequest(req);
  if (!wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const walletLc = wallet.toLowerCase();

  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim().toUpperCase();
  if (!/^POD-[A-Z0-9]{8}$/.test(code)) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 400 });
  }

  // Validate the link.
  const { data: link } = await supabaseAdmin
    .from('pod_invite_links')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (!link || link.revoked_at) {
    return NextResponse.json({ error: 'This invite link is no longer active.' }, { status: 410 });
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite link has expired.' }, { status: 410 });
  }
  if (link.max_uses != null && link.use_count >= link.max_uses) {
    return NextResponse.json({ error: 'This invite link has reached its maximum uses.' }, { status: 410 });
  }

  const { data: pod } = await supabaseAdmin
    .from('pods')
    .select('id, name')
    .eq('id', link.pod_id)
    .maybeSingle();
  if (!pod) {
    return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
  }

  // Already a member? Succeed quietly.
  const { data: existingMember } = await supabaseAdmin
    .from('pod_members')
    .select('id')
    .eq('pod_id', pod.id)
    .eq('wallet', walletLc)
    .eq('is_active', true)
    .maybeSingle();
  if (existingMember) {
    return NextResponse.json({ joined: false, alreadyMember: true, podName: pod.name });
  }

  // Resolve the role this link grants.
  const { data: role } = await supabaseAdmin
    .from('pod_role_permissions')
    .select('id, role_name, token_address, eligibility_criteria')
    .eq('id', link.role_id)
    .eq('is_active', true)
    .maybeSingle();
  if (!role) {
    return NextResponse.json(
      { error: 'The role for this invite no longer exists.' },
      { status: 410 },
    );
  }

  // Enforce non-agreement eligibility criteria (agreements are signed
  // post-join on the pod page, same as the application flow).
  const criteria = Array.isArray(role.eligibility_criteria)
    ? role.eligibility_criteria.filter((c: any) => c?.type !== 'agreement_signed')
    : [];
  if (criteria.length > 0) {
    try {
      const { EligibilityService } = await import(
        '@/features/pods/services/EligibilityService'
      );
      const evaluation = await EligibilityService.evaluateCriteria({
        userAddress: wallet,
        podId: pod.id,
        roleId: role.id,
        criteria,
      });
      if (!evaluation?.eligible) {
        return NextResponse.json(
          {
            error: `You don't yet meet the eligibility requirements for ${pod.name}.`,
            details: evaluation?.overallResult?.message ?? null,
          },
          { status: 403 },
        );
      }
    } catch (e) {
      console.error('[pod-invites/accept] eligibility check failed:', e);
      return NextResponse.json(
        { error: 'Could not verify eligibility. Please try again.' },
        { status: 500 },
      );
    }
  }

  // Grant DB membership now.
  const now = new Date().toISOString();
  const { error: memberError } = await supabaseAdmin.from('pod_members').upsert(
    {
      pod_id: pod.id,
      wallet: walletLc,
      membership_type: 'member',
      role: 'member',
      hat_id: role.token_address,
      is_active: true,
      joined_at: now,
      created_at: now,
      updated_at: now,
    },
    { onConflict: 'pod_id,wallet' },
  );
  if (memberError) {
    console.error('[pod-invites/accept] pod_members insert failed:', memberError);
    return NextResponse.json({ error: 'Failed to join pod' }, { status: 500 });
  }

  // Queue the on-chain hat mint for a leader's batch (idempotent per link+wallet).
  await supabaseAdmin.from('pod_invite_acceptances').upsert(
    {
      link_id: link.id,
      pod_id: pod.id,
      wallet: walletLc,
      hat_id: role.token_address,
    },
    { onConflict: 'link_id,wallet' },
  );

  // Count the use.
  await supabaseAdmin
    .from('pod_invite_links')
    .update({ use_count: (link.use_count || 0) + 1 })
    .eq('id', link.id);

  // Attribution: if the joiner has no platform referrer yet, credit the link creator.
  await supabaseAdmin
    .from('user_profiles')
    .update({ invited_by: link.created_by })
    .eq('wallet_address', walletLc)
    .is('invited_by', null);

  return NextResponse.json({ joined: true, podName: pod.name, podId: pod.id });
}
