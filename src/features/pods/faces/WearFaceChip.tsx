// src/features/pods/faces/WearFaceChip.tsx
// Contextual "Wear this look" affordance on the pod detail page
// (docs/spec-pod-faces.md §7.1). Renders only when the pod has a published
// face AND the viewer is a member. A shortcut to the same
// active_face_pod_id setting the Identity → Appearance switcher controls.

'use client';

import { useState, useEffect } from 'react';
import { Loader2, Palette, Check } from 'lucide-react';
import { useFace } from '@/context/FaceContext';
import { useDatabaseFirstPermissions } from '@/hooks/useDatabaseFirstPermissions';

export function WearFaceChip({ podId }: { podId: string }) {
  const { activeFacePodId, refreshFace } = useFace();
  const { isMemberOf } = useDatabaseFirstPermissions();
  const [hasPublishedFace, setHasPublishedFace] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Published faces are public — no auth needed.
    fetch(`/api/pods/${podId}/face`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) {
          setHasPublishedFace(json?.face?.status === 'published');
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [podId]);

  if (!hasPublishedFace || !isMemberOf(podId)) return null;

  const wearing = activeFacePodId === podId;

  const toggle = async () => {
    setBusy(true);
    try {
      const { supabase } = await import('@/utils/supabaseClient');
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) return;
      const res = await fetch('/api/account/active-face', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ podId: wearing ? null : podId }),
      });
      if (res.ok) await refreshFace();
    } catch {
      /* cosmetic — fail silently */
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={
        wearing
          ? 'Stop wearing this look (revert to default appearance)'
          : "Apply this pod's look to your app"
      }
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
      style={
        wearing
          ? {
              backgroundColor: 'hsl(var(--primary))',
              color: 'hsl(var(--primary-foreground))',
              borderColor: 'hsl(var(--primary))',
            }
          : {
              backgroundColor: 'hsl(var(--primary) / 0.08)',
              color: 'hsl(var(--primary))',
              borderColor: 'hsl(var(--primary) / 0.3)',
            }
      }
    >
      {busy ? (
        <Loader2 size={12} className="animate-spin" />
      ) : wearing ? (
        <Check size={12} />
      ) : (
        <Palette size={12} />
      )}
      {wearing ? 'Wearing this look' : 'Wear this look'}
    </button>
  );
}
