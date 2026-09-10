// src/features/identity/components/LocationSection.tsx
// Identity → Location: opt-in sharing of roughly where you are with the
// pods you belong to, so you can appear on a pod's shared map (Places
// module). Stored in member_locations (own row + members of shared pods
// can read; see migration 20260910000002). Approximate (~1 km) by default.

'use client';

import { useEffect, useState } from 'react';
import { Loader2, MapPin, Search, Trash2 } from 'lucide-react';
import { getAuthHeaders } from '@/lib/authHeaders';

type Precision = 'exact' | 'approximate';

interface SavedLocation {
  wallet: string;
  lat: number;
  lng: number;
  precision: Precision;
  address: string | null;
  share_with_pods: boolean;
  updated_at: string;
}

interface GeocodeHit {
  label: string;
  lat: number;
  lng: number;
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

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.15)',
  background: 'hsl(var(--card))',
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid rgba(0,0,0,0.15)',
  background: 'hsl(var(--card))',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const primaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'hsl(var(--primary))',
  color: 'hsl(var(--primary-foreground))',
  border: '1px solid transparent',
};

export function LocationSection() {
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<SavedLocation | null>(null);

  const [share, setShare] = useState(true);
  const [precision, setPrecision] = useState<Precision>('approximate');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeHit[]>([]);
  const [picked, setPicked] = useState<GeocodeHit | null>(null);

  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const auth = await getAuthHeaders();
        if (!auth.Authorization) {
          if (!cancelled) setHasSession(false);
          return;
        }
        if (!cancelled) setHasSession(true);
        const res = await fetch('/api/account/location', { headers: auth });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const loc = (json.location ?? null) as SavedLocation | null;
        setSaved(loc);
        if (loc) {
          setShare(loc.share_with_pods);
          setPrecision(loc.precision);
          setQuery(loc.address ?? '');
        }
      } catch {
        /* section still renders; user can save fresh */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const find = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    setResults([]);
    setPicked(null);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { headers: auth });
      if (!res.ok) throw new Error((await res.json()).error || 'Search failed');
      const json = await res.json();
      const hits = (json.results ?? []) as GeocodeHit[];
      setResults(hits.slice(0, 5));
      if (hits.length === 0) setNotice('No matches. Try adding a city or country.');
      else setNotice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const auth = await getAuthHeaders();
      const body: Record<string, unknown> = {
        precision,
        share_with_pods: share,
      };
      if (picked) {
        body.lat = picked.lat;
        body.lng = picked.lng;
        body.address = picked.label;
      } else if (saved && query.trim() === (saved.address ?? '')) {
        // Only toggles changed — keep the stored point.
        body.lat = saved.lat;
        body.lng = saved.lng;
        body.address = saved.address;
      } else if (query.trim()) {
        body.address = query.trim(); // server geocodes
      } else {
        throw new Error('Enter an address or pick a search result first');
      }
      const res = await fetch('/api/account/location', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      setSaved(json.location as SavedLocation);
      setQuery(json.location?.address ?? query);
      setResults([]);
      setPicked(null);
      setNotice('Saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    setError(null);
    setNotice(null);
    try {
      const auth = await getAuthHeaders();
      const res = await fetch('/api/account/location', { method: 'DELETE', headers: auth });
      if (!res.ok) throw new Error((await res.json()).error || 'Could not remove');
      setSaved(null);
      setQuery('');
      setResults([]);
      setPicked(null);
      setShare(true);
      setPrecision('approximate');
      setNotice('Removed. You no longer appear on any pod map.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove');
    } finally {
      setRemoving(false);
    }
  };

  if (hasSession === false) return null;

  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={headerStyle}>
        <MapPin size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
        Location
      </h3>
      <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginBottom: 8 }}>
        Sharing lets members of your pods see roughly where you are on the pod map, and nothing more.
      </p>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => setShare(e.target.checked)}
            />
            Share my location with my pods
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPicked(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  find();
                }
              }}
              placeholder="Town, neighbourhood, or address"
              style={inputStyle}
            />
            <button
              type="button"
              onClick={find}
              disabled={searching || !query.trim()}
              style={buttonStyle}
            >
              {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Find
            </button>
          </div>

          {results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {results.map((r) => {
                const selected = picked?.label === r.label;
                return (
                  <button
                    key={`${r.lat},${r.lng},${r.label}`}
                    type="button"
                    onClick={() => {
                      setPicked(r);
                      setQuery(r.label);
                      setResults([]);
                    }}
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: selected
                        ? '2px solid hsl(var(--primary))'
                        : '1px solid rgba(0,0,0,0.12)',
                      background: 'hsl(var(--card))',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name="location-precision"
                checked={precision === 'approximate'}
                onChange={() => setPrecision('approximate')}
              />
              Approximate — about 1 km, recommended
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name="location-precision"
                checked={precision === 'exact'}
                onChange={() => setPrecision('exact')}
              />
              Exact
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={save}
              disabled={saving || removing}
              style={primaryButtonStyle}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
              Save
            </button>
            {saved && (
              <button
                type="button"
                onClick={remove}
                disabled={saving || removing}
                style={buttonStyle}
              >
                {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Remove
              </button>
            )}
          </div>

          <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', margin: 0 }}>
            {saved
              ? `Saved: ${saved.address ?? `${saved.lat.toFixed(2)}, ${saved.lng.toFixed(2)}`} · ${
                  saved.precision === 'exact' ? 'exact' : 'approximate (~1 km)'
                } · ${saved.share_with_pods ? 'shared with your pods' : 'not shared'}`
              : 'Not saved. You do not appear on any pod map.'}
          </p>

          {notice && (
            <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))', margin: 0 }}>{notice}</p>
          )}
          {error && (
            <p style={{ fontSize: 12, color: 'hsl(var(--destructive))', margin: 0 }}>{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
