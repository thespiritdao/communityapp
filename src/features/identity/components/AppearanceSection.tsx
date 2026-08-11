// src/features/identity/components/AppearanceSection.tsx
// Identity → Appearance: the canonical Pod Faces switcher
// (docs/spec-pod-faces.md §7.1). Lists the SpiritDAO default plus the
// published face of every pod the user belongs to; one tap applies.
// The pod-page "Wear this look" chip is a shortcut to the same setting.

'use client';

import { useState, useEffect } from 'react';
import { Loader2, Check, Palette } from 'lucide-react';
import { useFace } from '@/context/FaceContext';
import {
  FACE_DEFAULT_COLORS,
  type FaceColors,
} from '@/features/pods/faces/faceConfig';

interface AvailableFace {
  podId: string;
  podName: string;
  podImageUrl: string | null;
  colors: FaceColors;
}

const headerStyle: React.CSSProperties = {
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#8FA09A',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginTop: '1rem',
  marginBottom: '0.5rem',
};

function Swatch({ colors }: { colors: FaceColors }) {
  const c = { ...FACE_DEFAULT_COLORS, ...colors };
  return (
    <span
      style={{
        display: 'flex',
        width: 28,
        height: 28,
        borderRadius: '50%',
        overflow: 'hidden',
        border: '1px solid rgba(0,0,0,0.15)',
        flexShrink: 0,
      }}
    >
      <span style={{ flex: 1, backgroundColor: c.primary }} />
      <span style={{ flex: 1, backgroundColor: c.secondary }} />
      <span style={{ flex: 1, backgroundColor: c.background }} />
    </span>
  );
}

export function AppearanceSection() {
  const { activeFacePodId, refreshFace } = useFace();
  const [faces, setFaces] = useState<AvailableFace[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | 'default' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import('@/utils/supabaseClient');
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
        if (!token) return;
        const res = await fetch('/api/account/faces', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setFaces(json.faces ?? []);
      } catch {
        /* section renders with just the default */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const apply = async (podId: string | null) => {
    setApplying(podId ?? 'default');
    setError(null);
    try {
      const { supabase } = await import('@/utils/supabaseClient');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const res = await fetch('/api/account/active-face', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ podId }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Could not apply');
      await refreshFace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply appearance');
    } finally {
      setApplying(null);
    }
  };

  // Nothing to choose from → don't render an empty section.
  if (!loading && faces.length === 0 && !activeFacePodId) return null;

  const rowStyle = (selected: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: '10px 12px',
    borderRadius: 10,
    border: selected
      ? '2px solid hsl(var(--primary))'
      : '1px solid rgba(0,0,0,0.12)',
    background: 'hsl(var(--card))',
    cursor: 'pointer',
    textAlign: 'left',
  });

  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={headerStyle}>
        <Palette size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
        Appearance
      </h3>
      <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>
        Wear the look of one of your communities, or the SpiritDAO default.
      </p>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <Loader2 size={14} className="animate-spin" /> Loading looks…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={() => activeFacePodId && apply(null)}
            disabled={applying !== null}
            style={rowStyle(!activeFacePodId)}
          >
            <Swatch colors={{}} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
              SpiritDAO default
            </span>
            {applying === 'default' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              !activeFacePodId && <Check size={16} style={{ color: 'hsl(var(--primary))' }} />
            )}
          </button>

          {faces.map((f) => {
            const selected = activeFacePodId === f.podId;
            return (
              <button
                key={f.podId}
                type="button"
                onClick={() => !selected && apply(f.podId)}
                disabled={applying !== null}
                style={rowStyle(selected)}
              >
                <Swatch colors={f.colors} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>
                    {f.podName}
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>
                    Community look
                  </span>
                </span>
                {applying === f.podId ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  selected && <Check size={16} style={{ color: 'hsl(var(--primary))' }} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <p style={{ fontSize: 12, color: 'hsl(var(--destructive))', marginTop: 6 }}>{error}</p>
      )}
    </div>
  );
}
