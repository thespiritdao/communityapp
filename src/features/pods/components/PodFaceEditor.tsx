// src/features/pods/components/PodFaceEditor.tsx
// Leader-facing Face editor (docs/spec-pod-faces.md §6). Rendered as the
// Custom Appearance module's config panel in PodModulesManager. Server-side
// authority is the face API (leader OR appearanceManage OR exec); this UI is
// cosmetic gating only, like every other manage surface.
//
// Icons resolve per slot: pod upload (own iconography) → pack icon → default.
// Packs give a coherent one-tap base; uploads let the community be fully
// itself, slot by slot.

'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, RotateCcw, Upload, X } from 'lucide-react';
import {
  FACE_DEFAULT_COLORS,
  FACE_ICON_SLOTS,
  FACE_ICON_UPLOAD,
  FACE_LABEL_MAX_LENGTH,
  validateFaceContrast,
  contrastRatio,
  FACE_MIN_CONTRAST,
  type FaceColorToken,
  type FaceColors,
  type FaceIconMap,
  type FaceIconSlot,
  type FaceLabelMap,
  type PodFace,
} from '@/features/pods/faces/faceConfig';
import { hexToHslTriplet } from '@/features/pods/faces/faceTheme';
import { ICON_PACKS, resolvePackIcon, type PackSlot } from '@/config/iconPacks';
import {
  HOME_USER_MODULES,
  HOME_COMMUNITY_MODULES,
  BOTTOM_NAV_ITEMS,
} from '@/config/moduleRegistry';
import { useFace } from '@/context/FaceContext';

interface PodFaceEditorProps {
  podId: string;
  podName: string;
  isManager: boolean;
}

const TOKEN_LABELS: Array<{ token: FaceColorToken; label: string; hint: string }> = [
  { token: 'primary', label: 'Primary', hint: 'Buttons, links, active nav' },
  { token: 'primaryForeground', label: 'Text on primary', hint: 'Label color inside primary buttons' },
  { token: 'background', label: 'Background', hint: 'App and nav background' },
  { token: 'foreground', label: 'Text', hint: 'Main text color' },
  { token: 'secondary', label: 'Section surface', hint: 'Home screen section bands' },
  { token: 'accent', label: 'Accent surface', hint: 'Highlighted surfaces' },
  { token: 'destructive', label: 'Alerts', hint: 'Notification badge, errors' },
];

// Starter palettes (spec §6) — each pre-verified to pass the WCAG AA pairs.
const PRESETS: Array<{ id: string; label: string; colors: Record<FaceColorToken, string> }> = [
  { id: 'forest', label: 'Forest', colors: { ...FACE_DEFAULT_COLORS } },
  {
    id: 'ocean',
    label: 'Ocean',
    colors: {
      primary: '#1E5A7A', primaryForeground: '#F0F7FA', background: '#F2F7F9',
      foreground: '#143C50', secondary: '#E2EEF3', accent: '#D6E8F0', destructive: '#8B3A3A',
    },
  },
  {
    id: 'dusk',
    label: 'Dusk',
    colors: {
      primary: '#5A4A7A', primaryForeground: '#F6F4FA', background: '#F6F4FA',
      foreground: '#2E2440', secondary: '#EAE6F2', accent: '#E0DAEE', destructive: '#8B3A3A',
    },
  },
  {
    id: 'ember',
    label: 'Ember',
    colors: {
      primary: '#8A4B2F', primaryForeground: '#FAF3EC', background: '#FAF5EF',
      foreground: '#4A2A1A', secondary: '#F2E8DC', accent: '#EEDFC9', destructive: '#7A2E2E',
    },
  },
  {
    id: 'slate',
    label: 'Slate',
    colors: {
      primary: '#3A4A55', primaryForeground: '#F2F5F7', background: '#F4F6F7',
      foreground: '#22303A', secondary: '#E6EBEE', accent: '#DCE4E8', destructive: '#8B3A3A',
    },
  },
];

type PackChoice = 'default' | keyof typeof ICON_PACKS;
type Uploads = Partial<Record<FaceIconSlot, string>>;

/** All customizable slots with display metadata for the icon grid. */
const SLOT_META: Array<{
  slot: FaceIconSlot;
  label: string;
  /** default PNG for home slots / logo; nav slots use lucide defaults */
  defaultPng?: string;
}> = [
  { slot: 'logo', label: 'Logo', defaultPng: '/images/spiritdaosymbol.png' },
  ...[...HOME_USER_MODULES, ...HOME_COMMUNITY_MODULES].map((m) => ({
    slot: m.slot,
    label: m.label,
    defaultPng: m.defaultIcon,
  })),
  ...BOTTOM_NAV_ITEMS.map((n) => ({ slot: n.slot, label: `Nav: ${n.label}` })),
];

/** Slots whose menu label can be renamed: the home-grid modules. Nav items
 *  are icon-only (renames would be invisible) and the logo has no label. */
const RENAMABLE_MODULES = [...HOME_USER_MODULES, ...HOME_COMMUNITY_MODULES].map(
  (m) => ({ slot: m.slot, label: m.label }),
);

/** Drop blank/whitespace renames so only real overrides are stored. */
function cleanLabels(labels: FaceLabelMap): FaceLabelMap {
  const out: FaceLabelMap = {};
  for (const [slot, value] of Object.entries(labels)) {
    const trimmed = value?.trim();
    if (trimmed) out[slot as FaceIconSlot] = trimmed;
  }
  return out;
}

/** Merge the chosen pack (base layer) with per-slot uploads (override layer)
 *  into the icon_map the API stores. */
function buildIconMap(pack: PackChoice, uploads: Uploads): FaceIconMap {
  const map: FaceIconMap = {};
  if (pack !== 'default') {
    for (const slot of FACE_ICON_SLOTS) {
      if (slot === 'logo') continue; // packs don't cover the logo
      map[slot] = { type: 'pack', value: `${pack}/${slot}` };
    }
  }
  for (const [slot, url] of Object.entries(uploads)) {
    if (url) map[slot as FaceIconSlot] = { type: 'upload', value: url };
  }
  return map;
}

/** Split a stored icon_map back into editor state. */
function parseIconMap(iconMap: FaceIconMap | undefined): { pack: PackChoice; uploads: Uploads } {
  let pack: PackChoice = 'default';
  const uploads: Uploads = {};
  for (const [slot, src] of Object.entries(iconMap ?? {})) {
    if (src?.type === 'upload') uploads[slot as FaceIconSlot] = src.value;
    else if (src?.type === 'pack' && pack === 'default') {
      const packId = src.value.split('/')[0];
      if (packId in ICON_PACKS) pack = packId as PackChoice;
    }
  }
  return { pack, uploads };
}

// ── Live preview ────────────────────────────────────────────────────────────
// A miniature home screen + bottom nav rendered inside a wrapper that sets
// the face CSS variables locally, so `hsl(var(--token))` resolves to the
// DRAFT palette here without touching the real app theme.

const PREVIEW_TILES: Array<{ slot: PackSlot; label: string; png: string }> = [
  { slot: 'chat', label: 'Chat', png: '/images/icons/chaticon.png' },
  { slot: 'governance', label: 'Governance', png: '/images/icons/governanceicon.png' },
  { slot: 'knowledge', label: 'Knowledge', png: '/images/icons/knowledgebaseicon.png' },
];

const PREVIEW_NAV: PackSlot[] = ['nav.home', 'nav.claims', 'nav.governance', 'nav.alerts'];

function FacePreview({
  colors,
  pack,
  uploads,
  labels,
  podName,
}: {
  colors: FaceColors;
  pack: PackChoice;
  uploads: Uploads;
  labels: FaceLabelMap;
  podName: string;
}) {
  const vars = useMemo(() => {
    const style: Record<string, string> = {};
    for (const [token, cssVar] of [
      ['primary', '--primary'],
      ['primaryForeground', '--primary-foreground'],
      ['background', '--background'],
      ['foreground', '--foreground'],
      ['secondary', '--secondary'],
      ['accent', '--accent'],
      ['destructive', '--destructive'],
    ] as Array<[FaceColorToken, string]>) {
      const hex = colors[token];
      if (hex) style[cssVar] = hexToHslTriplet(hex);
    }
    return style as React.CSSProperties;
  }, [colors]);

  const circle: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: '50%',
    objectFit: 'cover',
  };

  const tileIcon = (slot: PackSlot, png: string, label: string) => {
    const uploaded = uploads[slot];
    if (uploaded) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={uploaded} alt={label} style={circle} />;
    }
    const PackIcon = pack !== 'default' ? resolvePackIcon(`${pack}/${slot}`) : null;
    if (PackIcon) {
      return (
        <span
          style={{
            ...circle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'hsl(var(--primary) / 0.12)',
            color: 'hsl(var(--primary))',
          }}
        >
          <PackIcon style={{ width: 22, height: 22 }} strokeWidth={1.75} />
        </span>
      );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={png} alt={label} style={circle} />;
  };

  return (
    <div
      style={{
        ...vars,
        backgroundColor: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        borderRadius: 12,
        border: '1px solid hsl(var(--foreground) / 0.15)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 14px', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        {uploads.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={uploads.logo} alt="logo" style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover' }} />
        )}
        Welcome to {podName}.
      </div>
      <div
        style={{
          margin: '0 10px 10px', padding: 10, borderRadius: 8,
          backgroundColor: 'hsl(var(--secondary))',
          display: 'flex', justifyContent: 'space-around',
        }}
      >
        {PREVIEW_TILES.map((t) => {
          const label = labels[t.slot]?.trim() || t.label;
          return (
            <div key={t.slot} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              {tileIcon(t.slot, t.png, label)}
              <span style={{ fontSize: 10, fontWeight: 700 }}>{label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ margin: '0 10px 10px' }}>
        <span
          style={{
            display: 'inline-block', padding: '6px 14px', borderRadius: 8,
            backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))',
            fontSize: 12, fontWeight: 600,
          }}
        >
          Primary button
        </span>
      </div>
      <div
        style={{
          display: 'flex', justifyContent: 'space-around', alignItems: 'center',
          padding: '8px 0', borderTop: '1px solid hsl(var(--foreground) / 0.1)',
          backgroundColor: 'hsl(var(--background))',
        }}
      >
        {PREVIEW_NAV.map((slot, i) => {
          const uploaded = uploads[slot];
          const Icon =
            (pack !== 'default' ? resolvePackIcon(`${pack}/${slot}`) : null) ??
            ICON_PACKS.linework.icons[slot];
          return (
            <span
              key={slot}
              style={{
                color: i === 0 ? 'hsl(var(--primary))' : 'hsl(var(--foreground) / 0.5)',
                position: 'relative', display: 'flex',
              }}
            >
              {uploaded ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={uploaded}
                  alt=""
                  style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 5, opacity: i === 0 ? 1 : 0.55 }}
                />
              ) : (
                <Icon size={22} />
              )}
              {slot === 'nav.alerts' && (
                <span
                  style={{
                    position: 'absolute', top: -4, right: -6, width: 12, height: 12,
                    borderRadius: '50%', backgroundColor: 'hsl(var(--destructive))',
                  }}
                />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

export default function PodFaceEditor({ podId, podName, isManager }: PodFaceEditorProps) {
  const { toast } = useToast();
  const { refreshFace, activeFacePodId } = useFace();

  const [colors, setColors] = useState<Record<FaceColorToken, string>>({ ...FACE_DEFAULT_COLORS });
  const [pack, setPack] = useState<PackChoice>('default');
  const [uploads, setUploads] = useState<Uploads>({});
  const [labels, setLabels] = useState<FaceLabelMap>({});
  const [savedStatus, setSavedStatus] = useState<'none' | 'draft' | 'published'>('none');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<FaceIconSlot | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSlotRef = useRef<FaceIconSlot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import('@/utils/supabaseClient');
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
        const res = await fetch(`/api/pods/${podId}/face`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const face: PodFace | null = json.face;
        if (face) {
          setColors({ ...FACE_DEFAULT_COLORS, ...(face.colors ?? {}) });
          const parsed = parseIconMap(face.icon_map);
          setPack(parsed.pack);
          setUploads(parsed.uploads);
          setLabels(face.label_map ?? {});
          setSavedStatus(face.status);
        }
      } catch {
        /* editor opens with defaults */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [podId]);

  const contrast = validateFaceContrast(colors);

  const authHeaders = async (): Promise<Record<string, string>> => {
    const { supabase } = await import('@/utils/supabaseClient');
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) throw new Error('Not authenticated');
    return { Authorization: `Bearer ${token}` };
  };

  // ── Custom icon upload ──
  const pickIconFor = (slot: FaceIconSlot) => {
    if (!isManager || saving) return;
    pendingSlotRef.current = slot;
    fileInputRef.current?.click();
  };

  const onIconFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const slot = pendingSlotRef.current;
    e.target.value = ''; // allow re-picking the same file
    if (!file || !slot) return;

    if (!(FACE_ICON_UPLOAD.allowedTypes as readonly string[]).includes(file.type)) {
      toast({ title: 'PNG, JPEG, or WebP only', variant: 'destructive' });
      return;
    }
    if (file.size > FACE_ICON_UPLOAD.maxBytes) {
      toast({
        title: `Icon too large — maximum ${Math.round(FACE_ICON_UPLOAD.maxBytes / 1024)}KB`,
        variant: 'destructive',
      });
      return;
    }

    setUploadingSlot(slot);
    try {
      const headers = await authHeaders();
      const form = new FormData();
      form.set('slot', slot);
      form.set('file', file);
      const res = await fetch(`/api/pods/${podId}/face/icon`, {
        method: 'POST',
        headers,
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setUploads((prev) => ({ ...prev, [slot]: json.url }));
      toast({ title: 'Icon uploaded', description: 'Remember to Save or Publish to apply it.' });
    } catch (err) {
      toast({
        title: 'Could not upload icon',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUploadingSlot(null);
    }
  };

  const clearUpload = (slot: FaceIconSlot) => {
    setUploads((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
  };

  // ── Save / publish / remove ──
  const save = async (status: 'draft' | 'published') => {
    if (!isManager) return;
    if (status === 'published' && !contrast.ok) return;
    if (
      status === 'draft' &&
      savedStatus === 'published' &&
      !window.confirm(
        'Saving as a draft will unpublish the current face — members wearing it revert to the default appearance until you publish again. Continue?',
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/pods/${podId}/face`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          colors,
          icon_map: buildIconMap(pack, uploads),
          label_map: cleanLabels(labels),
          status,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.details?.join('; ') || json.error || 'Save failed');

      setSavedStatus(status);
      toast({
        title: status === 'published' ? 'Face published' : 'Draft saved',
        description:
          status === 'published'
            ? 'Members of this pod can now wear this face from Identity → Appearance.'
            : 'Your draft is saved. Publish when you’re ready.',
      });
      // If this leader is wearing this pod's face, re-apply immediately.
      if (activeFacePodId === podId) await refreshFace();
    } catch (err) {
      toast({
        title: 'Could not save face',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const removeFace = async () => {
    if (!isManager) return;
    if (!window.confirm('Remove this face entirely? Members wearing it revert to the default appearance.')) return;
    setSaving(true);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/pods/${podId}/face`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error((await res.json()).error || 'Delete failed');
      setColors({ ...FACE_DEFAULT_COLORS });
      setPack('default');
      setUploads({});
      setLabels({});
      setSavedStatus('none');
      toast({ title: 'Face removed' });
      if (activeFacePodId === podId) await refreshFace();
    } catch (err) {
      toast({
        title: 'Could not remove face',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading face…
      </div>
    );
  }

  // Resolved tile for the icon grid: upload → pack → default.
  const slotTile = (meta: (typeof SLOT_META)[number]) => {
    const uploaded = uploads[meta.slot];
    const box: React.CSSProperties = {
      width: 44,
      height: 44,
      borderRadius: 10,
      objectFit: 'cover',
    };
    if (uploaded) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={uploaded} alt={meta.label} style={box} />;
    }
    const PackIcon =
      pack !== 'default' && meta.slot !== 'logo'
        ? resolvePackIcon(`${pack}/${meta.slot}`)
        : null;
    if (PackIcon) {
      return (
        <span
          style={{
            ...box,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'hsl(var(--primary) / 0.12)',
            color: 'hsl(var(--primary))',
          }}
        >
          <PackIcon style={{ width: 24, height: 24 }} strokeWidth={1.75} />
        </span>
      );
    }
    if (meta.defaultPng) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={meta.defaultPng} alt={meta.label} style={box} />;
    }
    const NavDefault = BOTTOM_NAV_ITEMS.find((n) => n.slot === meta.slot)?.defaultIcon;
    return NavDefault ? (
      <span style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <NavDefault size={26} />
      </span>
    ) : null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">Design your pod&apos;s face</h4>
          <p className="text-sm text-muted-foreground">
            Members choose whether to wear it — publishing never forces a look on anyone.
          </p>
        </div>
        {savedStatus !== 'none' && (
          <span
            className="text-xs font-medium px-2 py-1 rounded-full"
            style={{
              backgroundColor: savedStatus === 'published' ? '#D1E6DC' : '#FAF4EC',
              color: savedStatus === 'published' ? '#2F5D50' : '#8F6B2F',
            }}
          >
            {savedStatus === 'published' ? 'Published' : 'Draft'}
          </span>
        )}
      </div>

      {/* Presets */}
      <div>
        <p className="text-sm font-medium mb-2">Start from a palette</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setColors({ ...p.colors })}
              className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-accent"
              disabled={!isManager || saving}
            >
              <span className="flex overflow-hidden rounded-full border" style={{ width: 20, height: 20 }}>
                <span style={{ flex: 1, backgroundColor: p.colors.primary }} />
                <span style={{ flex: 1, backgroundColor: p.colors.secondary }} />
              </span>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Color pickers + preview side by side on wide screens */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          {TOKEN_LABELS.map(({ token, label, hint }) => (
            <div key={token} className="flex items-center gap-3">
              <input
                type="color"
                value={colors[token]}
                onChange={(e) =>
                  setColors((prev) => ({ ...prev, [token]: e.target.value.toUpperCase() }))
                }
                disabled={!isManager || saving}
                className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5"
                aria-label={label}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{label}</p>
                <p className="text-xs text-muted-foreground leading-tight">{hint}</p>
              </div>
              <code className="text-xs text-muted-foreground">{colors[token]}</code>
            </div>
          ))}

          {/* Contrast feedback — publishing is blocked until AA passes. */}
          {!contrast.ok ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {contrast.errors.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Contrast: text {contrastRatio(colors.foreground, colors.background).toFixed(1)}:1, button{' '}
              {contrastRatio(colors.primaryForeground, colors.primary).toFixed(1)}:1 (min{' '}
              {FACE_MIN_CONTRAST}:1) ✓
            </p>
          )}
        </div>

        <div>
          <p className="text-sm font-medium mb-2">Preview</p>
          <FacePreview colors={colors} pack={pack} uploads={uploads} labels={labels} podName={podName} />
        </div>
      </div>

      {/* Icon set — the coherent base layer */}
      <div>
        <p className="text-sm font-medium mb-2">Icon set</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPack('default')}
            className={`rounded-lg border px-3 py-1.5 text-sm hover:bg-accent ${pack === 'default' ? 'border-primary ring-1 ring-primary' : ''}`}
            disabled={!isManager || saving}
          >
            SpiritDAO default
          </button>
          {Object.values(ICON_PACKS).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPack(p.id as PackChoice)}
              className={`rounded-lg border px-3 py-1.5 text-sm hover:bg-accent ${pack === p.id ? 'border-primary ring-1 ring-primary' : ''}`}
              disabled={!isManager || saving}
              title={p.description}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom icons — the pod's own iconography, slot by slot */}
      <div>
        <p className="text-sm font-medium mb-1">Your own icons</p>
        <p className="text-xs text-muted-foreground mb-2">
          Upload your community&apos;s own artwork for any button — it overrides the icon set
          for that slot. Square images look best (128×128px or larger; PNG, JPEG, or WebP;
          max {Math.round(FACE_ICON_UPLOAD.maxBytes / 1024)}KB).
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          onChange={onIconFile}
          className="hidden"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {SLOT_META.map((meta) => (
            <div
              key={meta.slot}
              className="flex items-center gap-2 rounded-lg border p-2"
            >
              {slotTile(meta)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{meta.label}</p>
                <div className="mt-0.5 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => pickIconFor(meta.slot)}
                    disabled={!isManager || saving || uploadingSlot !== null}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                  >
                    {uploadingSlot === meta.slot ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Upload size={11} />
                    )}
                    {uploads[meta.slot] ? 'Replace' : 'Upload'}
                  </button>
                  {uploads[meta.slot] && (
                    <button
                      type="button"
                      onClick={() => clearUpload(meta.slot)}
                      disabled={!isManager || saving}
                      className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:underline"
                      title="Remove custom icon (revert to icon set / default)"
                    >
                      <X size={11} />
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rename menu items — the community's own words for each module */}
      <div>
        <p className="text-sm font-medium mb-1">Rename menu items</p>
        <p className="text-xs text-muted-foreground mb-2">
          Give home-screen buttons your community&apos;s own names (e.g. Bounties →
          Quests). Leave a field blank to keep the default. Only the button label
          changes — pages keep their standard titles. Max {FACE_LABEL_MAX_LENGTH}{' '}
          characters.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {RENAMABLE_MODULES.map((m) => (
            <label key={m.slot} className="block">
              <span className="mb-0.5 block text-xs font-medium">{m.label}</span>
              <input
                type="text"
                value={labels[m.slot] ?? ''}
                onChange={(e) =>
                  setLabels((prev) => ({ ...prev, [m.slot]: e.target.value }))
                }
                placeholder={m.label}
                maxLength={FACE_LABEL_MAX_LENGTH}
                disabled={!isManager || saving}
                className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm disabled:opacity-50"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Actions */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Button size="sm" variant="outline" onClick={() => save('draft')} disabled={!isManager || saving}>
          {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Save draft
        </Button>
        <Button
          size="sm"
          onClick={() => save('published')}
          disabled={!isManager || saving || !contrast.ok}
          title={!contrast.ok ? 'Fix the contrast issues above to publish' : undefined}
        >
          {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Publish
        </Button>
        {savedStatus !== 'none' && (
          <Button
            size="sm"
            variant="ghost"
            onClick={removeFace}
            disabled={!isManager || saving}
            className="ml-auto text-destructive"
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            Remove face
          </Button>
        )}
      </Card>
    </div>
  );
}
