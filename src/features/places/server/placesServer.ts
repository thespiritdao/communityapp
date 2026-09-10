// src/features/places/server/placesServer.ts
// Server-only helpers shared by the Places routes (route files may only
// export HTTP handlers, so shared logic lives here). Uses the service-role
// client; callers are responsible for authorization.

import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { PLACES_BUCKET, PLACES_SIGNED_URL_TTL } from '@/lib/placesGuard';
import { PLACE_KINDS, PLACE_STATUSES } from '../types';
import type { PlaceLink, PodPlace } from '../types';

const KINDS = new Set<string>(PLACE_KINDS);
const STATUSES = new Set<string>(PLACE_STATUSES);
const LINK_TARGETS = new Set(['thread', 'event', 'knowledge_item', 'member', 'pod', 'place']);

/** Validate + normalise a pin payload. `partial` = PUT semantics. */
export function normalisePlaceInput(
  body: Record<string, unknown>,
  partial = false,
): { row: Record<string, unknown>; links?: PlaceLink[] } | { error: string } {
  const row: Record<string, unknown> = {};

  if (!partial || 'title' in body) {
    const title = String(body.title ?? '').trim();
    if (!title) return { error: 'Title is required' };
    if (title.length > 120) return { error: 'Title must be 120 characters or fewer' };
    row.title = title;
  }
  if ('description' in body) {
    const d = body.description == null ? null : String(body.description).trim();
    if (d && d.length > 4000) return { error: 'Description must be 4000 characters or fewer' };
    row.description = d || null;
  }
  if (!partial || 'kind' in body) {
    const kind = String(body.kind ?? 'site');
    if (!KINDS.has(kind)) return { error: 'Invalid kind' };
    row.kind = kind;
  }
  if (!partial || 'status' in body) {
    const status = String(body.status ?? 'existing');
    if (!STATUSES.has(status)) return { error: 'Invalid status' };
    row.status = status;
  }
  if (!partial || 'lat' in body || 'lng' in body) {
    const lat = body.lat == null || body.lat === '' ? null : Number(body.lat);
    const lng = body.lng == null || body.lng === '' ? null : Number(body.lng);
    if ((lat == null) !== (lng == null)) return { error: 'lat and lng must be provided together' };
    if (lat != null && (Number.isNaN(lat) || lat < -90 || lat > 90)) return { error: 'Invalid latitude' };
    if (lng != null && (Number.isNaN(lng) || lng < -180 || lng > 180)) return { error: 'Invalid longitude' };
    row.lat = lat;
    row.lng = lng;
  }
  if ('address' in body) {
    const a = body.address == null ? null : String(body.address).trim().slice(0, 300);
    row.address = a || null;
  }
  if (!partial || 'precision' in body) {
    const p = String(body.precision ?? 'exact');
    if (p !== 'exact' && p !== 'approximate') return { error: 'Invalid precision' };
    row.precision = p;
  }
  if ('metadata' in body) {
    row.metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};
  }

  let links: PlaceLink[] | undefined;
  if ('links' in body) {
    if (!Array.isArray(body.links)) return { error: 'links must be an array' };
    links = [];
    const seen = new Set<string>();
    for (const raw of body.links as unknown[]) {
      const l = (raw ?? {}) as Record<string, unknown>;
      const target_type = String(l.target_type ?? '');
      const target_id = String(l.target_id ?? '').trim();
      if (!LINK_TARGETS.has(target_type) || !target_id) return { error: 'Invalid link' };
      const key = `${target_type}:${target_id.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({
        target_type: target_type as PlaceLink['target_type'],
        target_id: target_type === 'member' ? target_id.toLowerCase() : target_id,
        label: l.label == null ? null : String(l.label).trim().slice(0, 80) || null,
      });
    }
    if (links.length > 50) return { error: 'Too many links (max 50)' };
  }

  return { row, links };
}

export async function signCovers(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return out;
  const { data } = await supabaseAdmin.storage
    .from(PLACES_BUCKET)
    .createSignedUrls(unique, PLACES_SIGNED_URL_TTL);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  }
  return out;
}

/** Resolve display titles for links (thread titles, member names, event titles, place titles). */
export async function resolveLinkTitles(links: PlaceLink[], placesById: Map<string, string>) {
  const threadIds = links.filter((l) => l.target_type === 'thread').map((l) => l.target_id);
  const memberWallets = links.filter((l) => l.target_type === 'member').map((l) => l.target_id);
  const eventIds = links.filter((l) => l.target_type === 'event').map((l) => l.target_id);

  const [threads, members, events] = await Promise.all([
    threadIds.length
      ? supabaseAdmin.from('forum_threads').select('id, title').in('id', threadIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    memberWallets.length
      ? supabaseAdmin.from('user_profiles').select('wallet_address, first_name, last_name').in('wallet_address', memberWallets)
      : Promise.resolve({ data: [] as { wallet_address: string; first_name: string | null; last_name: string | null }[] }),
    eventIds.length
      ? supabaseAdmin.from('events').select('id, title').in('id', eventIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);

  const threadTitle = new Map((threads.data ?? []).map((t) => [t.id, t.title]));
  const eventTitle = new Map((events.data ?? []).map((e) => [e.id, e.title]));
  const memberName = new Map(
    (members.data ?? []).map((m) => [
      String(m.wallet_address).toLowerCase(),
      `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || `${String(m.wallet_address).slice(0, 6)}…`,
    ]),
  );

  for (const l of links) {
    if (l.target_type === 'thread') l.target_title = threadTitle.get(l.target_id) ?? null;
    else if (l.target_type === 'member') l.target_title = memberName.get(l.target_id.toLowerCase()) ?? null;
    else if (l.target_type === 'event') l.target_title = eventTitle.get(l.target_id) ?? null;
    else if (l.target_type === 'place') l.target_title = placesById.get(l.target_id) ?? null;
  }
}

export async function loadPlace(placeId: string): Promise<PodPlace | null> {
  const { data: place } = await supabaseAdmin.from('pod_places').select('*').eq('id', placeId).maybeSingle();
  if (!place) return null;
  const { data: links } = await supabaseAdmin.from('pod_place_links').select('*').eq('place_id', placeId);
  const covers = await signCovers([place.cover_image_path].filter(Boolean));
  const { data: siblings } = await supabaseAdmin.from('pod_places').select('id, title').eq('pod_id', place.pod_id);
  const placesById = new Map((siblings ?? []).map((p) => [p.id, p.title]));
  const resolvedLinks = (links ?? []) as PlaceLink[];
  await resolveLinkTitles(resolvedLinks, placesById);
  return {
    ...place,
    cover_image_url: place.cover_image_path ? covers.get(place.cover_image_path) ?? null : null,
    links: resolvedLinks,
  } as PodPlace;
}
