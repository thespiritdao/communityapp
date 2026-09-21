// Pod roles list — audience picker source for the AddPasswordModal.
//
//   GET /api/pods/[id]/passwords/roles
//        → returns every pod_role_permissions row for the pod, plus
//          whether each role currently has passwordsAccess (drives
//          whether the role appears as a checkable option).

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import jwt from 'jsonwebtoken';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

export const runtime = 'nodejs';

async function getCallerWallet(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  try {
    const payload = (await verifySessionTokenOrThrow(token)) as any;
    const w =
      payload?.wallet_address ?? payload?.user_metadata?.wallet_address;
    return typeof w === 'string' ? w.toLowerCase() : null;
  } catch {
    return null;
  }
}

async function callerHasPermission(
  podId: string,
  wallet: string,
  permission: 'passwordsAccess' | 'passwordsManage',
): Promise<boolean> {
  const { data: memberships, error } = await supabaseAdmin
    .from('active_pod_members')
    .select('hat_id')
    .eq('pod_id', podId)
    .eq('wallet', wallet)
    .eq('is_active', true);
  if (error || !memberships || memberships.length === 0) return false;
  const hatIds = memberships.map((m: any) => m.hat_id).filter(Boolean);
  if (hatIds.length === 0) return false;
  const { data: roles, error: rolesError } = await supabaseAdmin
    .from('pod_role_permissions')
    .select('permissions')
    .eq('pod_id', podId)
    .in('token_address', hatIds);
  if (rolesError) return false;
  return (roles ?? []).some(
    (r: any) => r?.permissions?.[permission] === true,
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const podId = params.id;
  const caller = await getCallerWallet(req);
  if (!caller) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // Anyone with passwordsAccess can see the role list — they need it
  // to understand whose audience they're in. Managers use it to assign.
  if (!(await callerHasPermission(podId, caller, 'passwordsAccess'))) {
    return NextResponse.json(
      { error: 'missing passwordsAccess permission' },
      { status: 403 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('pod_role_permissions')
    // No role_type column on pod_role_permissions; "type" is derived
    // from role_name (e.g. "Pod Leader" → leader). Matches the
    // convention used in PodManagerControlPanel + UnifiedMembershipManager.
    .select('id, role_name, permissions')
    .eq('pod_id', podId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const roles = (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.role_name,
    type: /leader/i.test(r.role_name ?? '') ? 'leader' : 'member',
    hasPasswordsAccess: r.permissions?.passwordsAccess === true,
    hasPasswordsManage: r.permissions?.passwordsManage === true,
  }));

  return NextResponse.json({ roles });
}
