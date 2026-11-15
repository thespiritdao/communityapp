// src/features/places/components/PlacesMap.tsx
// MapLibre map for the Places add-on. Renders pod pins (coloured by kind),
// opted-in member locations (approximate → 1 km circle), and relationship
// lines between linked pins. Also used in "pick" mode by the editor.
//
// Load with next/dynamic({ ssr: false }) — MapLibre touches window.
// Tiles: OpenFreeMap (no key). CSP: tiles host in connect-src, worker-src 'self'.

'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MLMap, Marker, LngLatBoundsLike } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { PodPlace, MemberPin } from '../types';
import { PLACE_KIND_META } from '../types';

export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// MapLibre v6 cannot find its worker inside Next's bundle; the worker files
// are copied to public/maplibre by scripts/build/copy-maplibre-worker.mjs.
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

export interface PlacesMapProps {
  places: PodPlace[];
  members?: MemberPin[];
  selectedId?: string | null;
  onSelect?: (placeId: string | null) => void;
  /** Pick mode: clicking the map reports a coordinate instead of selecting pins. */
  pickMode?: boolean;
  onPick?: (lat: number, lng: number) => void;
  /** A single provisional marker (editor). */
  draft?: { lat: number; lng: number } | null;
  defaultCenter?: { lat: number; lng: number; zoom?: number } | null;
  height?: number | string;
  className?: string;
}

/** ~64-point polygon approximating a circle of `radiusM` metres. */
function circlePolygon(lat: number, lng: number, radiusM: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const pts: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
}

function pinElement(color: string, opts: { dashed?: boolean; selected?: boolean; retired?: boolean }) {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', 'Place');
  el.style.cssText = [
    'width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);',
    `background:${opts.retired ? '#9AA6B2' : color};`,
    `border:2px ${opts.dashed ? 'dashed' : 'solid'} #fff;`,
    'box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer;padding:0;',
    opts.selected ? 'outline:3px solid #1B2430;outline-offset:1px;' : '',
  ].join('');
  return el;
}

function memberElement(name: string, avatar: string | null) {
  const el = document.createElement('div');
  el.title = name;
  el.style.cssText =
    'width:26px;height:26px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);' +
    'background:#1F5F8B;color:#fff;font:600 11px/22px system-ui;text-align:center;overflow:hidden;cursor:default;';
  if (avatar) {
    const img = document.createElement('img');
    img.src = avatar;
    img.alt = name;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    el.appendChild(img);
  } else {
    el.textContent = name.split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase() || '•';
  }
  return el;
}

export default function PlacesMap({
  places,
  members = [],
  selectedId = null,
  onSelect,
  pickMode = false,
  onPick,
  draft = null,
  defaultCenter = null,
  height = 360,
  className,
}: PlacesMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const draftRef = useRef<Marker | null>(null);
  const loadedRef = useRef(false);
  const fittedRef = useRef(false);
  const pickRef = useRef<{ pickMode: boolean; onPick?: (lat: number, lng: number) => void }>({ pickMode, onPick });
  pickRef.current = { pickMode, onPick };
  // Latest data pass; the load handler runs it once the sources exist.
  const applyRef = useRef<(() => void) | null>(null);

  // ── init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: defaultCenter ? [defaultCenter.lng, defaultCenter.lat] : [0, 20],
      zoom: defaultCenter?.zoom ?? 1.5,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      loadedRef.current = true;
      map.addSource('approx', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'approx-fill',
        type: 'fill',
        source: 'approx',
        paint: { 'fill-color': '#1F5F8B', 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: 'approx-line',
        type: 'line',
        source: 'approx',
        paint: { 'line-color': '#1F5F8B', 'line-opacity': 0.5, 'line-width': 1 },
      });
      map.addSource('relations', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'relations-line',
        type: 'line',
        source: 'relations',
        paint: { 'line-color': '#5B6874', 'line-width': 2, 'line-dasharray': [2, 2] },
      });
      // run a data pass now that sources exist
      applyRef.current?.();
    });
    map.on('click', (e) => {
      const { pickMode: pm, onPick: cb } = pickRef.current;
      if (pm && cb) cb(e.lngLat.lat, e.lngLat.lng);
      else onSelect?.(null);
    });
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      draftRef.current?.remove();
      draftRef.current = null;
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!loadedRef.current) return;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const approx: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
      const relations: GeoJSON.Feature<GeoJSON.LineString>[] = [];
      const bounds = new maplibregl.LngLatBounds();
      let any = false;

      const byId = new Map(places.map((p) => [p.id, p]));

      for (const p of places) {
        if (p.lat == null || p.lng == null) continue;
        any = true;
        bounds.extend([p.lng, p.lat]);
        const el = pinElement(PLACE_KIND_META[p.kind]?.color ?? '#5B6874', {
          dashed: p.status === 'proposed',
          selected: p.id === selectedId,
          retired: p.status === 'retired',
        });
        el.setAttribute('aria-label', p.title);
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (!pickRef.current.pickMode) onSelect?.(p.id);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
        markersRef.current.push(marker);

        if (p.precision === 'approximate') approx.push(circlePolygon(p.lat, p.lng, 500));

        for (const l of p.links ?? []) {
          if (l.target_type !== 'place') continue;
          const q = byId.get(l.target_id);
          if (!q || q.lat == null || q.lng == null) continue;
          if (p.id > q.id) continue; // draw each pair once
          relations.push({
            type: 'Feature',
            properties: { label: l.label ?? '' },
            geometry: { type: 'LineString', coordinates: [[p.lng, p.lat], [q.lng, q.lat]] },
          });
        }
      }

      for (const m of members) {
        any = true;
        bounds.extend([m.lng, m.lat]);
        const marker = new maplibregl.Marker({ element: memberElement(m.name, m.avatar), anchor: 'center' })
          .setLngLat([m.lng, m.lat])
          .addTo(map);
        markersRef.current.push(marker);
        if (m.precision === 'approximate') approx.push(circlePolygon(m.lat, m.lng, 1000));
      }

      (map.getSource('approx') as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: approx,
      });
      (map.getSource('relations') as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: relations,
      });

      if (any && !fittedRef.current && !defaultCenter) {
        fittedRef.current = true;
        map.fitBounds(bounds as LngLatBoundsLike, { padding: 48, maxZoom: 14, duration: 0 });
      }
    };

    applyRef.current = apply;
    if (loadedRef.current) apply();
    return () => {
      if (applyRef.current === apply) applyRef.current = null;
    };
  }, [places, members, selectedId, onSelect, defaultCenter]);

  // ── draft marker (editor) ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    draftRef.current?.remove();
    draftRef.current = null;
    if (draft) {
      const el = pinElement('#1B2430', { selected: true });
      draftRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([draft.lng, draft.lat])
        .addTo(map);
      map.easeTo({ center: [draft.lng, draft.lat], zoom: Math.max(map.getZoom(), 12), duration: 300 });
    }
  }, [draft]);

  // ── fly to selection ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const p = places.find((x) => x.id === selectedId);
    if (p?.lat != null && p.lng != null) {
      map.easeTo({ center: [p.lng, p.lat], duration: 400 });
    }
  }, [selectedId, places]);

  useEffect(() => {
    mapRef.current?.resize();
  }, [height]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: pickMode ? 'crosshair' : undefined,
      }}
      aria-label="Map"
    />
  );
}
