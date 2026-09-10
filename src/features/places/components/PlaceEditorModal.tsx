// src/features/places/components/PlaceEditorModal.tsx
// Create / edit a pin. Location can be set by address search (/api/geocode),
// by tapping the mini map, or by typing coordinates. Links connect the pin
// to journal entries (forum threads), members, and other pins.

'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Search, MapPin, X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/utils/supabaseClient';
import { createPlace, updatePlace, uploadPlaceCover, geocode, type GeocodeResult } from '../services/placesApi';
import type { PlaceInput, PlaceKind, PlaceLink, PlacePrecision, PlaceStatus, PodPlace } from '../types';
import { PLACE_KIND_META, PLACE_KINDS, PLACE_STATUSES, PLACE_STATUS_META } from '../types';

const PlacesMap = dynamic(() => import('./PlacesMap'), { ssr: false, loading: () => <div className="h-[220px] rounded-xl bg-gray-100" /> });

interface Props {
  podId: string;
  existing: PodPlace | null;
  places: PodPlace[];
  defaultCenter: { lat: number; lng: number; zoom?: number } | null;
  onClose: () => void;
  onSaved: (place: PodPlace) => void;
}

interface ThreadOpt { id: string; title: string }
interface MemberOpt { wallet: string; name: string }

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-300';

export function PlaceEditorModal({ podId, existing, places, defaultCenter, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [kind, setKind] = useState<PlaceKind>(existing?.kind ?? 'site');
  const [status, setStatus] = useState<PlaceStatus>(existing?.status ?? 'existing');
  const [precision, setPrecision] = useState<PlacePrecision>(existing?.precision ?? 'exact');
  const [address, setAddress] = useState(existing?.address ?? '');
  const [lat, setLat] = useState<string>(existing?.lat != null ? String(existing.lat) : '');
  const [lng, setLng] = useState<string>(existing?.lng != null ? String(existing.lng) : '');
  const [links, setLinks] = useState<PlaceLink[]>(existing?.links ?? []);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const [geoBusy, setGeoBusy] = useState(false);
  const [geoResults, setGeoResults] = useState<GeocodeResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [threads, setThreads] = useState<ThreadOpt[]>([]);
  const [members, setMembers] = useState<MemberOpt[]>([]);
  const [threadFilter, setThreadFilter] = useState('');
  const [memberFilter, setMemberFilter] = useState('');
  const [openGroup, setOpenGroup] = useState<'threads' | 'members' | 'places' | null>(null);

  const draft = useMemo(() => {
    const a = Number(lat), b = Number(lng);
    return lat !== '' && lng !== '' && !Number.isNaN(a) && !Number.isNaN(b) ? { lat: a, lng: b } : null;
  }, [lat, lng]);

  // Options for links: this pod's journal entries / threads and members.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: cats } = await supabase.from('forum_categories').select('id').eq('pod_id', podId);
        const catIds = (cats ?? []).map((c: { id: string }) => c.id);
        if (catIds.length) {
          const { data: th } = await supabase
            .from('forum_threads')
            .select('id, title')
            .in('category_id', catIds)
            .order('created_at', { ascending: false })
            .limit(150);
          if (!cancelled) setThreads((th ?? []) as ThreadOpt[]);
        }
        const { data: pm } = await supabase
          .from('pod_members')
          .select('wallet')
          .eq('pod_id', podId)
          .eq('is_active', true);
        const wallets = [...new Set((pm ?? []).map((m: { wallet: string }) => String(m.wallet).toLowerCase()))];
        if (wallets.length) {
          const { data: profs } = await supabase
            .from('user_profiles')
            .select('wallet_address, first_name, last_name')
            .in('wallet_address', wallets);
          const byW = new Map((profs ?? []).map((p: { wallet_address: string; first_name: string | null; last_name: string | null }) => [
            String(p.wallet_address).toLowerCase(),
            `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
          ]));
          if (!cancelled) {
            setMembers(wallets.map((w) => ({ wallet: w, name: byW.get(w) || `${w.slice(0, 6)}…${w.slice(-4)}` })));
          }
        }
      } catch {
        /* pickers degrade to empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [podId]);

  const hasLink = (t: PlaceLink['target_type'], id: string) =>
    links.some((l) => l.target_type === t && l.target_id.toLowerCase() === id.toLowerCase());
  const toggleLink = (t: PlaceLink['target_type'], id: string) => {
    setLinks((prev) =>
      hasLink(t, id)
        ? prev.filter((l) => !(l.target_type === t && l.target_id.toLowerCase() === id.toLowerCase()))
        : [...prev, { target_type: t, target_id: id, label: null }],
    );
  };
  const setLinkLabel = (t: PlaceLink['target_type'], id: string, label: string) => {
    setLinks((prev) => prev.map((l) => (l.target_type === t && l.target_id === id ? { ...l, label: label || null } : l)));
  };

  const runGeocode = async () => {
    if (!address.trim()) return;
    setGeoBusy(true);
    setError(null);
    try {
      const results = await geocode(address.trim());
      setGeoResults(results);
      if (results.length === 0) setError('No matches. Try a fuller address, or tap the map.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setGeoBusy(false);
    }
  };

  const pickResult = (r: GeocodeResult) => {
    setAddress(r.label);
    setLat(String(r.lat));
    setLng(String(r.lng));
    setGeoResults([]);
  };

  const submit = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Give the place a name.');
      return;
    }
    if ((lat === '') !== (lng === '')) {
      setError('Enter both latitude and longitude, or neither.');
      return;
    }
    setSaving(true);
    try {
      const input: PlaceInput = {
        title: title.trim(),
        description: description.trim() || null,
        kind,
        status,
        precision,
        address: address.trim() || null,
        lat: lat === '' ? null : Number(lat),
        lng: lng === '' ? null : Number(lng),
        links: links.map(({ target_type, target_id, label }) => ({ target_type, target_id, label })),
      };
      let saved = existing ? await updatePlace(podId, existing.id, input) : await createPlace(podId, input);
      if (coverFile) {
        const { cover_image_url } = await uploadPlaceCover(podId, saved.id, coverFile);
        saved = { ...saved, cover_image_url };
      }
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const otherPlaces = places.filter((p) => p.id !== existing?.id);
  const filteredThreads = threads.filter((t) => t.title.toLowerCase().includes(threadFilter.toLowerCase())).slice(0, 40);
  const filteredMembers = members.filter((m) => m.name.toLowerCase().includes(memberFilter.toLowerCase())).slice(0, 40);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" role="dialog" aria-modal="true">
      <div className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
          <h4 className="font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4" /> {existing ? 'Edit place' : 'Add a place'}
          </h4>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" disabled={saving}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Name</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The north orchard" maxLength={120} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Kind</label>
              <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as PlaceKind)}>
                {PLACE_KINDS.map((k) => (
                  <option key={k} value={k}>{PLACE_KIND_META[k].label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">{PLACE_KIND_META[kind].hint}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Status</label>
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as PlaceStatus)}>
                {PLACE_STATUSES.map((s) => (
                  <option key={s} value={s}>{PLACE_STATUS_META[s].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Precision</label>
              <select className={inputCls} value={precision} onChange={(e) => setPrecision(e.target.value as PlacePrecision)}>
                <option value="exact">Exact point</option>
                <option value="approximate">Approximate (~500 m)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What is here, who stewards it, why it matters" maxLength={4000} />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Location</label>
            <div className="flex gap-2">
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Search an address or place name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void runGeocode();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={runGeocode} disabled={geoBusy || !address.trim()}>
                {geoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {geoResults.length > 0 && (
              <ul className="rounded-md border divide-y max-h-40 overflow-y-auto">
                {geoResults.map((r) => (
                  <li key={`${r.lat},${r.lng}`}>
                    <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={() => pickResult(r)}>
                      {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-500">Or tap the map to drop the pin.</p>
            <PlacesMap
              places={[]}
              pickMode
              onPick={(a, b) => {
                setLat(a.toFixed(6));
                setLng(b.toFixed(6));
              }}
              draft={draft}
              defaultCenter={draft ? { ...draft, zoom: 13 } : defaultCenter}
              height={220}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" inputMode="decimal" />
              <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitude" inputMode="decimal" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Cover photo</label>
            <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border px-3 py-2 text-sm hover:bg-gray-50">
              <Upload className="h-4 w-4" />
              {coverFile ? coverFile.name : existing?.cover_image_url ? 'Replace photo' : 'Choose a photo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <p className="mt-1 text-xs text-gray-500">JPEG, PNG or WebP, up to 5 MB. Visible to pod members only.</p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Connect to</label>

            <div className="rounded-md border">
              <button type="button" className="w-full flex justify-between px-3 py-2 text-sm font-medium" onClick={() => setOpenGroup(openGroup === 'threads' ? null : 'threads')}>
                <span>Journal entries &amp; threads</span>
                <span className="text-gray-500">{links.filter((l) => l.target_type === 'thread').length}</span>
              </button>
              {openGroup === 'threads' && (
                <div className="border-t p-2 space-y-2">
                  <Input value={threadFilter} onChange={(e) => setThreadFilter(e.target.value)} placeholder="Filter by title" />
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {filteredThreads.length === 0 && <p className="text-xs text-gray-500 px-1">No threads found.</p>}
                    {filteredThreads.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-sm px-1">
                        <input type="checkbox" checked={hasLink('thread', t.id)} onChange={() => toggleLink('thread', t.id)} />
                        <span className="truncate">{t.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-md border">
              <button type="button" className="w-full flex justify-between px-3 py-2 text-sm font-medium" onClick={() => setOpenGroup(openGroup === 'members' ? null : 'members')}>
                <span>People</span>
                <span className="text-gray-500">{links.filter((l) => l.target_type === 'member').length}</span>
              </button>
              {openGroup === 'members' && (
                <div className="border-t p-2 space-y-2">
                  <Input value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} placeholder="Filter by name" />
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {filteredMembers.map((m) => (
                      <div key={m.wallet} className="flex items-center gap-2 text-sm px-1">
                        <input type="checkbox" checked={hasLink('member', m.wallet)} onChange={() => toggleLink('member', m.wallet)} />
                        <span className="truncate flex-1">{m.name}</span>
                        {hasLink('member', m.wallet) && (
                          <input
                            className="w-28 rounded border px-2 py-0.5 text-xs"
                            placeholder="role, e.g. steward"
                            value={links.find((l) => l.target_type === 'member' && l.target_id === m.wallet)?.label ?? ''}
                            onChange={(e) => setLinkLabel('member', m.wallet, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-md border">
              <button type="button" className="w-full flex justify-between px-3 py-2 text-sm font-medium" onClick={() => setOpenGroup(openGroup === 'places' ? null : 'places')}>
                <span>Related places</span>
                <span className="text-gray-500">{links.filter((l) => l.target_type === 'place').length}</span>
              </button>
              {openGroup === 'places' && (
                <div className="border-t p-2 max-h-40 overflow-y-auto space-y-1">
                  {otherPlaces.length === 0 && <p className="text-xs text-gray-500 px-1">No other places yet.</p>}
                  {otherPlaces.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-sm px-1">
                      <input type="checkbox" checked={hasLink('place', p.id)} onChange={() => toggleLink('place', p.id)} />
                      <span className="truncate flex-1">{p.title}</span>
                      {hasLink('place', p.id) && (
                        <input
                          className="w-28 rounded border px-2 py-0.5 text-xs"
                          placeholder="relationship"
                          value={links.find((l) => l.target_type === 'place' && l.target_id === p.id)?.label ?? ''}
                          onChange={(e) => setLinkLabel('place', p.id, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white px-4 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {existing ? 'Save changes' : 'Add place'}
          </Button>
        </div>
      </div>
    </div>
  );
}
