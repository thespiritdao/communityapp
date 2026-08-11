// src/context/FaceContext.tsx
// Pod Faces provider (docs/spec-pod-faces.md §5.1). Loads the user's active
// face (the pod appearance they chose to wear), injects its color tokens as
// CSS variables on <html>, and exposes the icon map to SlotIcon consumers.
//
// Cold-start flash is avoided with a localStorage snapshot: the last applied
// face is re-applied synchronously on mount, then refreshed from the server.
// Fallback chain: active face → SpiritDAO default (vars cleared). A face that
// was unpublished, deleted, or whose membership lapsed simply resolves to
// null server-side and we revert — no error surface needed.

'use client';

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useUserWallet } from '@/hooks/useUserWallet';
import type { PodFace, FaceIconMap } from '@/features/pods/faces/faceConfig';
import { applyFaceColors, clearFaceColors } from '@/features/pods/faces/faceTheme';

const CACHE_KEY = 'pod-face-cache-v1';

interface FaceContextValue {
  /** The published face the user wears, or null for the default appearance. */
  face: PodFace | null;
  activeFacePodId: string | null;
  loading: boolean;
  /** Icon remap of the active face ({} when none). */
  iconMap: FaceIconMap;
  /** Re-fetch after the user switches faces or a leader republishes. */
  refreshFace: () => Promise<void>;
}

const FaceContext = createContext<FaceContextValue>({
  face: null,
  activeFacePodId: null,
  loading: false,
  iconMap: {},
  refreshFace: async () => {},
});

export const useFace = () => useContext(FaceContext);

function readCache(): PodFace | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as PodFace) : null;
  } catch {
    return null;
  }
}

function writeCache(face: PodFace | null): void {
  try {
    if (face) localStorage.setItem(CACHE_KEY, JSON.stringify(face));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* storage unavailable — cosmetic feature, ignore */
  }
}

export function FaceProvider({ children }: { children: ReactNode }) {
  const wallet = useUserWallet();
  const [face, setFace] = useState<PodFace | null>(null);
  const [loading, setLoading] = useState(false);

  // Synchronous-ish first paint from the cache, before any network round-trip.
  useEffect(() => {
    const cached = readCache();
    if (cached) {
      setFace(cached);
      applyFaceColors(cached.colors ?? {});
    }
  }, []);

  const refreshFace = useCallback(async () => {
    if (!wallet) {
      setFace(null);
      writeCache(null);
      clearFaceColors();
      return;
    }
    setLoading(true);
    try {
      const { supabase } = await import('@/utils/supabaseClient');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) return;

      const res = await fetch('/api/account/active-face', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return; // keep whatever is applied; cosmetic feature
      const json = await res.json();
      const fresh: PodFace | null = json.face ?? null;

      setFace(fresh);
      writeCache(fresh);
      if (fresh) applyFaceColors(fresh.colors ?? {});
      else clearFaceColors();
    } catch {
      /* network failure — keep current appearance */
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    refreshFace();
  }, [refreshFace]);

  return (
    <FaceContext.Provider
      value={{
        face,
        activeFacePodId: face?.pod_id ?? null,
        loading,
        iconMap: face?.icon_map ?? {},
        refreshFace,
      }}
    >
      {children}
    </FaceContext.Provider>
  );
}
