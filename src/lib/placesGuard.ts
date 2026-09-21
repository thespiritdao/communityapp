// src/lib/placesGuard.ts
// Shared authorization for the Places (pod shared map) routes:
//   - viewing: any active pod member (requirePodMember)
//   - managing pins: pod leader OR placesManage grantee OR Executive Pod
//     Leader (parity with faceGuard / the modules route / client hooks).
// SERVER ONLY.

import { type NextRequest, NextResponse } from 'next/server';
import { requirePodPermissionOrLeader } from '@/lib/apiPodGuard';
import { getWalletFromRequest, isExecutiveLeader, isPodLeader } from '@/lib/serverPodAuth';
import { PodAccessControlService } from '@/features/pods/services/PodAccessControlService';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export interface PlacesConfig {
  label?: string;
  default_center?: { lat: number; lng: number; zoom?: number };
}

export async function requirePlacesManager(
  req: NextRequest,
  podId: string,
): Promise<string | NextResponse> {
  const walletOrDenied = await requirePodPermissionOrLeader(req, podId, 'placesManage');
  if (!(walletOrDenied instanceof NextResponse)) return walletOrDenied;

  const wallet = await getWalletFromRequest(req);
  if (wallet && (await isExecutiveLeader(wallet))) return wallet.toLowerCase();

  return walletOrDenied;
}

/** Non-throwing capability check used to tell the client whether to show manage controls. */
export async function canManagePlaces(podId: string, wallet: string): Promise<boolean> {
  const w = wallet.toLowerCase();
  const perm = await PodAccessControlService.requirePodPermission(w, podId, 'placesManage');
  if (perm.allowed) return true;
  if (await isPodLeader(podId, w)) return true;
  return isExecutiveLeader(w);
}

/** Module toggle + config for a pod. */
export async function getPlacesModule(
  podId: string,
): Promise<{ enabled: boolean; config: PlacesConfig }> {
  const { data } = await supabaseAdmin
    .from('pod_modules')
    .select('places_enabled, places_config')
    .eq('pod_id', podId)
    .maybeSingle();
  const config = (data?.places_config && typeof data.places_config === 'object'
    ? data.places_config
    : {}) as PlacesConfig;
  return { enabled: !!data?.places_enabled, config };
}

export const PLACES_BUCKET = 'place-images';
export const PLACES_SIGNED_URL_TTL = 60 * 60; // 1h
