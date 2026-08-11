// src/components/SlotIcon.tsx
// Face-aware icon rendering for the two remappable surfaces
// (docs/spec-pod-faces.md §5.2): the home-screen module grid and the bottom
// nav. Resolution order: active face's icon_map → pack icon; otherwise the
// registry default. Unknown pack references degrade to the default.

'use client';

import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';
import { useFace } from '@/context/FaceContext';
import { resolvePackIcon } from '@/config/iconPacks';
import type { FaceIconSlot } from '@/features/pods/faces/faceConfig';

function usePackIcon(slot: FaceIconSlot): LucideIcon | null {
  const { iconMap } = useFace();
  const source = iconMap[slot];
  if (!source || source.type !== 'pack') return null;
  return resolvePackIcon(source.value);
}

/**
 * Home-grid module icon: the default PNG, or the face's pack icon rendered
 * in a tinted circle (same .home-module-icon box, so sizing/responsive rules
 * in HomePage.css apply to both).
 */
export function HomeModuleIcon({
  slot,
  defaultIcon,
  label,
  eager = false,
}: {
  slot: FaceIconSlot;
  defaultIcon: string;
  label: string;
  eager?: boolean;
}) {
  const PackIcon = usePackIcon(slot);

  if (PackIcon) {
    return (
      <span
        className="home-module-icon"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'hsl(var(--primary) / 0.12)',
          color: 'hsl(var(--primary))',
        }}
        aria-label={label}
      >
        <PackIcon style={{ width: '58%', height: '58%' }} strokeWidth={1.75} />
      </span>
    );
  }

  return (
    <Image
      src={defaultIcon}
      alt={label}
      className="home-module-icon"
      width={64}
      height={64}
      loading={eager ? 'eager' : 'lazy'}
    />
  );
}

/** Bottom-nav icon: the registry's lucide default unless the face remaps it. */
export function NavSlotIcon({
  slot,
  defaultIcon,
  size = 36,
}: {
  slot: FaceIconSlot;
  defaultIcon: LucideIcon;
  size?: number;
}) {
  const PackIcon = usePackIcon(slot);
  const Icon = PackIcon ?? defaultIcon;
  return <Icon size={size} />;
}
