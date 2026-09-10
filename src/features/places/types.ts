// src/features/places/types.ts
// Shared types for the Places add-on (pod shared map).
// Spec: docs/spec-pod-places-and-journal.md

export type PlaceKind = 'asset' | 'partner' | 'site' | 'resource' | 'vision' | 'other';
export type PlaceStatus = 'existing' | 'proposed' | 'retired';
export type PlacePrecision = 'exact' | 'approximate';
export type PlaceLinkTarget = 'thread' | 'event' | 'knowledge_item' | 'member' | 'pod' | 'place';

export interface PlaceLink {
  id?: string;
  target_type: PlaceLinkTarget;
  target_id: string;
  label?: string | null;
  /** Resolved server-side for display (thread title, member name, place title). */
  target_title?: string | null;
}

export interface PodPlace {
  id: string;
  pod_id: string;
  title: string;
  description: string | null;
  kind: PlaceKind;
  status: PlaceStatus;
  lat: number | null;
  lng: number | null;
  address: string | null;
  precision: PlacePrecision;
  cover_image_path: string | null;
  /** Signed URL (1h) resolved server-side; null when no cover. */
  cover_image_url: string | null;
  metadata: Record<string, unknown>;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  links: PlaceLink[];
}

export interface MemberPin {
  wallet: string;
  name: string;
  avatar: string | null;
  lat: number;
  lng: number;
  precision: PlacePrecision;
}

export interface PlacesPayload {
  enabled: boolean;
  label: string;
  defaultCenter: { lat: number; lng: number; zoom?: number } | null;
  places: PodPlace[];
  members: MemberPin[];
  canManage: boolean;
}

export interface PlaceInput {
  title: string;
  description?: string | null;
  kind: PlaceKind;
  status: PlaceStatus;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  precision: PlacePrecision;
  metadata?: Record<string, unknown>;
  links?: Array<Pick<PlaceLink, 'target_type' | 'target_id' | 'label'>>;
}

export const PLACE_KIND_META: Record<PlaceKind, { label: string; color: string; hint: string }> = {
  asset: { label: 'Asset', color: '#3F7A5A', hint: 'Land, buildings, tools, equipment the community holds or stewards' },
  partner: { label: 'Partner', color: '#8F6B2F', hint: 'Organisations and allies you work with' },
  site: { label: 'Site', color: '#1F5F8B', hint: 'Gathering places, venues, meeting points' },
  resource: { label: 'Resource', color: '#6A5F7A', hint: 'Suppliers, services, shared infrastructure' },
  vision: { label: 'Vision', color: '#B54708', hint: 'Somewhere you are envisioning — not real yet' },
  other: { label: 'Other', color: '#5B6874', hint: 'Anything else worth a pin' },
};

export const PLACE_STATUS_META: Record<PlaceStatus, { label: string }> = {
  existing: { label: 'Existing' },
  proposed: { label: 'Proposed' },
  retired: { label: 'Retired' },
};

export const PLACE_KINDS = Object.keys(PLACE_KIND_META) as PlaceKind[];
export const PLACE_STATUSES = Object.keys(PLACE_STATUS_META) as PlaceStatus[];
