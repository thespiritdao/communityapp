// src/lib/faceGuard.ts
// Shared authorization for Pod Faces routes: pod leader OR appearanceManage
// grantee OR Executive Pod Leader (parity with the modules route + client
// hooks). Extracted from /api/pods/[id]/face so the icon-upload route can
// reuse it. SERVER ONLY.

import { type NextRequest, NextResponse } from 'next/server';
import { requirePodPermissionOrLeader } from '@/lib/apiPodGuard';
import { getWalletFromRequest, isExecutiveLeader } from '@/lib/serverPodAuth';

export async function requireFaceManager(
  req: NextRequest,
  podId: string,
): Promise<string | NextResponse> {
  const walletOrDenied = await requirePodPermissionOrLeader(
    req,
    podId,
    'appearanceManage',
  );
  if (!(walletOrDenied instanceof NextResponse)) return walletOrDenied;

  const wallet = getWalletFromRequest(req);
  if (wallet && (await isExecutiveLeader(wallet))) return wallet.toLowerCase();

  return walletOrDenied;
}
