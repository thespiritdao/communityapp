// src/features/places/services/placesApi.ts
// Client wrappers for the Places routes. Every call carries the Supabase
// session (getAuthHeaders); the server decides membership / management.

import { getAuthHeaders } from '@/lib/authHeaders';
import type { PlaceInput, PlacesPayload, PodPlace } from '../types';

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return body as T;
}

export async function fetchPlaces(podId: string): Promise<PlacesPayload> {
  const res = await fetch(`/api/pods/${podId}/places`, {
    headers: await getAuthHeaders(),
    cache: 'no-store',
  });
  return json<PlacesPayload>(res);
}

export async function createPlace(podId: string, input: PlaceInput): Promise<PodPlace> {
  const res = await fetch(`/api/pods/${podId}/places`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify(input),
  });
  return (await json<{ place: PodPlace }>(res)).place;
}

export async function updatePlace(
  podId: string,
  placeId: string,
  input: Partial<PlaceInput>,
): Promise<PodPlace> {
  const res = await fetch(`/api/pods/${podId}/places/${placeId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify(input),
  });
  return (await json<{ place: PodPlace }>(res)).place;
}

export async function deletePlace(podId: string, placeId: string): Promise<void> {
  const res = await fetch(`/api/pods/${podId}/places/${placeId}`, {
    method: 'DELETE',
    headers: await getAuthHeaders(),
  });
  await json<{ success: boolean }>(res);
}

export async function uploadPlaceCover(
  podId: string,
  placeId: string,
  file: File,
): Promise<{ cover_image_url: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/pods/${podId}/places/${placeId}/image`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: form,
  });
  return json<{ cover_image_url: string }>(res);
}

export async function updatePlacesSettings(
  podId: string,
  settings: { label?: string; default_center?: { lat: number; lng: number; zoom?: number } | null },
): Promise<void> {
  const res = await fetch(`/api/pods/${podId}/places`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
    body: JSON.stringify(settings),
  });
  await json<{ success: boolean }>(res);
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

/** Contract shared with /api/geocode (built alongside the Identity opt-in). */
export async function geocode(q: string): Promise<GeocodeResult[]> {
  const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
    headers: await getAuthHeaders(),
    cache: 'no-store',
  });
  return (await json<{ results: GeocodeResult[] }>(res)).results ?? [];
}
