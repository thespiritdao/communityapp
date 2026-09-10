// src/features/places/components/PodPlacesSection.tsx
//
// The Places add-on as it appears on the pod detail page (the screen every
// member sees). Renders nothing unless the module is on and the viewer is a
// member. Managers (pod leader / placesManage / Exec) get Add, Edit, Remove
// and a section-label rename; everyone else gets the map, list and details.
// Spec: docs/spec-pod-places-and-journal.md

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, List, Map as MapIcon, Plus, Loader2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/utils/supabaseClient';
import { fetchPlaces, deletePlace, updatePlacesSettings } from '../services/placesApi';
import type { PlaceKind, PlaceStatus, PlacesPayload, PodPlace } from '../types';
import { PLACE_KIND_META, PLACE_STATUS_META } from '../types';
import { PlaceDetailSheet } from './PlaceDetailSheet';
import { PlaceEditorModal } from './PlaceEditorModal';

const PlacesMap = dynamic(() => import('./PlacesMap'), {
  ssr: false,
  loading: () => <div className="h-[360px] rounded-xl bg-gray-100 animate-pulse" />,
});

interface Props {
  podId: string;
  walletAddress: string | undefined;
  isMember: boolean;
}

type StatusFilter = 'active' | PlaceStatus | 'all';

export function PodPlacesSection({ podId, walletAddress, isMember }: Props) {
  const [data, setData] = useState<PlacesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<'new' | PodPlace | null>(null);
  const [kindFilter, setKindFilter] = useState<PlaceKind | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await fetchPlaces(podId);
      setData(payload);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load places');
    } finally {
      setLoading(false);
    }
  }, [podId]);

  useEffect(() => {
    if (!isMember || !walletAddress) {
      setLoading(false);
      return;
    }
    void load();
  }, [isMember, walletAddress, load]);

  // Realtime: refetch (debounced) when any pin in this pod changes.
  useEffect(() => {
    if (!isMember || !walletAddress) return;
    const channel = supabase
      .channel(`pod-places-${podId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pod_places', filter: `pod_id=eq.${podId}` },
        () => {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => void load(), 400);
        },
      )
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [podId, isMember, walletAddress, load]);

  const places = data?.places ?? [];
  const kindsPresent = useMemo(
    () => (Object.keys(PLACE_KIND_META) as PlaceKind[]).filter((k) => places.some((p) => p.kind === k)),
    [places],
  );
  const visible = useMemo(
    () =>
      places.filter((p) => {
        if (kindFilter !== 'all' && p.kind !== kindFilter) return false;
        if (statusFilter === 'active') return p.status !== 'retired';
        if (statusFilter === 'all') return true;
        return p.status === statusFilter;
      }),
    [places, kindFilter, statusFilter],
  );
  const selected = visible.find((p) => p.id === selectedId) ?? places.find((p) => p.id === selectedId) ?? null;
  const unplaced = visible.filter((p) => p.lat == null);

  if (!isMember || !walletAddress) return null;
  if (loading) {
    return (
      <div className="space-y-2" id="places">
        <h3 className="text-xl font-semibold flex items-center gap-2"><MapPin className="h-5 w-5" /> Places</h3>
        <div className="h-[120px] rounded-xl bg-gray-100 animate-pulse" />
      </div>
    );
  }
  if (!data?.enabled) return null;

  const onSaved = (place: PodPlace) => {
    setEditing(null);
    setData((prev) => {
      if (!prev) return prev;
      const others = prev.places.filter((p) => p.id !== place.id);
      return { ...prev, places: [place, ...others] };
    });
    setSelectedId(place.id);
    void load();
  };

  const onDelete = async (place: PodPlace) => {
    if (!window.confirm(`Remove "${place.title}" from the map?`)) return;
    setBusy(true);
    try {
      await deletePlace(podId, place.id);
      setSelectedId(null);
      setData((prev) => (prev ? { ...prev, places: prev.places.filter((p) => p.id !== place.id) } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove');
    } finally {
      setBusy(false);
    }
  };

  const saveLabel = async () => {
    setBusy(true);
    try {
      await updatePlacesSettings(podId, { label: labelDraft.trim() });
      setRenaming(false);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" id="places">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-semibold flex items-center gap-2 min-w-0">
          <MapPin className="h-5 w-5 shrink-0" />
          {renaming ? (
            <span className="flex items-center gap-1">
              <input
                className="rounded border px-2 py-1 text-base w-44"
                value={labelDraft}
                maxLength={20}
                onChange={(e) => setLabelDraft(e.target.value)}
                placeholder="Places"
                autoFocus
              />
              <Button size="sm" variant="ghost" onClick={saveLabel} disabled={busy} aria-label="Save name"><Check className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(false)} aria-label="Cancel"><X className="h-4 w-4" /></Button>
            </span>
          ) : (
            <>
              <span className="truncate">{data.label}</span>
              <Badge variant="secondary">{places.length}</Badge>
              {data.canManage && (
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-700"
                  onClick={() => {
                    setLabelDraft(data.label === 'Places' ? '' : data.label);
                    setRenaming(true);
                  }}
                  aria-label="Rename section"
                  title="Rename this section for your community"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border overflow-hidden">
            <button
              type="button"
              className={`px-2.5 py-1.5 text-sm flex items-center gap-1 ${view === 'map' ? 'bg-gray-900 text-white' : 'bg-white'}`}
              onClick={() => setView('map')}
              aria-pressed={view === 'map'}
            >
              <MapIcon className="h-4 w-4" /> Map
            </button>
            <button
              type="button"
              className={`px-2.5 py-1.5 text-sm flex items-center gap-1 ${view === 'list' ? 'bg-gray-900 text-white' : 'bg-white'}`}
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
            >
              <List className="h-4 w-4" /> List
            </button>
          </div>
          {data.canManage && (
            <Button size="sm" onClick={() => setEditing('new')} disabled={busy}>
              <Plus className="h-4 w-4 mr-1" /> Add place
            </Button>
          )}
        </div>
      </div>

      {(kindsPresent.length > 1 || places.some((p) => p.status !== 'existing')) && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`rounded-full border px-3 py-1 text-xs ${kindFilter === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white'}`}
            onClick={() => setKindFilter('all')}
          >
            All
          </button>
          {kindsPresent.map((k) => (
            <button
              key={k}
              type="button"
              className="rounded-full border px-3 py-1 text-xs"
              style={
                kindFilter === k
                  ? { backgroundColor: PLACE_KIND_META[k].color, color: '#fff', borderColor: PLACE_KIND_META[k].color }
                  : { backgroundColor: '#fff' }
              }
              onClick={() => setKindFilter(kindFilter === k ? 'all' : k)}
            >
              {PLACE_KIND_META[k].label}
            </button>
          ))}
          <select
            className="ml-auto rounded-md border px-2 py-1 text-xs bg-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Status filter"
          >
            <option value="active">Existing + proposed</option>
            <option value="existing">Existing only</option>
            <option value="proposed">Proposed only</option>
            <option value="retired">Retired</option>
            <option value="all">Everything</option>
          </select>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}

      {places.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-600">
          No places yet.
          {data.canManage
            ? ' Add the first pin: land, a partner, a gathering site, or something you are envisioning.'
            : ' When your pod adds places they will appear here.'}
          {data.members.length > 0 && ` ${data.members.length} member${data.members.length === 1 ? ' has' : 's have'} shared a location.`}
        </div>
      ) : view === 'map' ? (
        <div className="space-y-3">
          <PlacesMap
            places={visible}
            members={data.members}
            selectedId={selectedId}
            onSelect={setSelectedId}
            defaultCenter={data.defaultCenter}
            height={360}
          />
          {selected && (
            <PlaceDetailSheet
              place={selected}
              canManage={data.canManage}
              onClose={() => setSelectedId(null)}
              onEdit={(p) => setEditing(p)}
              onDelete={onDelete}
              onSelectPlace={setSelectedId}
              busy={busy}
            />
          )}
          {unplaced.length > 0 && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">Not on the map yet:</span>{' '}
              {unplaced.map((p, i) => (
                <span key={p.id}>
                  <button type="button" className="underline" onClick={() => setSelectedId(p.id)}>{p.title}</button>
                  {i < unplaced.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          )}
          {data.members.length > 0 && (
            <p className="text-xs text-gray-500">
              Round markers are members who chose to share their location (Identity → Location). Shaded circles are approximate.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visible.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(selectedId === p.id ? null : p.id)}
                className={`text-left rounded-xl border bg-white overflow-hidden hover:shadow-sm ${selectedId === p.id ? 'ring-2 ring-gray-900' : ''}`}
              >
                {p.cover_image_url && <img src={p.cover_image_url} alt="" className="w-full h-28 object-cover" />}
                <div className="p-3 space-y-1">
                  <div className="font-medium leading-tight">{p.title}</div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge style={{ backgroundColor: PLACE_KIND_META[p.kind].color, color: '#fff' }}>{PLACE_KIND_META[p.kind].label}</Badge>
                    {p.status !== 'existing' && <Badge variant="secondary">{PLACE_STATUS_META[p.status].label}</Badge>}
                  </div>
                  {p.address && <div className="text-xs text-gray-500 truncate">{p.address}</div>}
                </div>
              </button>
            ))}
          </div>
          {selected && (
            <PlaceDetailSheet
              place={selected}
              canManage={data.canManage}
              onClose={() => setSelectedId(null)}
              onEdit={(p) => setEditing(p)}
              onDelete={onDelete}
              onSelectPlace={setSelectedId}
              busy={busy}
            />
          )}
        </div>
      )}

      {editing && (
        <PlaceEditorModal
          podId={podId}
          existing={editing === 'new' ? null : editing}
          places={places}
          defaultCenter={data.defaultCenter}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

export default PodPlacesSection;
