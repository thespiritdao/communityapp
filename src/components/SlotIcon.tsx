// src/components/SlotIcon.tsx
// Face-aware icon rendering for the remappable surfaces
// (docs/spec-pod-faces.md §5.2): the home-screen module grid, the bottom
// nav, and the home logo. Resolution order per slot:
//   upload (pod's own iconography) → pack icon → registry default.
// Unknown pack references and broken upload URLs degrade to the default.

'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';
import { useFace } from '@/context/FaceContext';
import { resolvePackIcon } from '@/config/iconPacks';
import type { FaceIconSlot, FaceIconSource } from '@/features/pods/faces/faceConfig';

function useSlotSource(slot: FaceIconSlot): FaceIconSource | null {
  const { iconMap } = useFace();
  return iconMap[slot] ?? null;
}

/** Pod-uploaded icon <img>, falling back to children on load error (e.g. the
 *  file was deleted from storage after the face was saved). */
function UploadImg({
  src,
  alt,
  className,
  style,
  onErrorFallback,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  onErrorFallback: React.ReactNode;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) return <>{onErrorFallback}</>;
  // Plain <img>: sources are user-uploaded storage URLs outside
  // next/image's configured domains.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      onError={() => setBroken(true)}
    />
  );
}

/**
 * Home-grid module icon: pod upload (round, like the default PNGs) →
 * pack icon in a tinted circle → default PNG. The .home-module-icon class
 * carries sizing/responsive rules for all three.
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
  const source = useSlotSource(slot);

  const defaultImg = (
    <Image
      src={defaultIcon}
      alt={label}
      className="home-module-icon"
      width={64}
      height={64}
      loading={eager ? 'eager' : 'lazy'}
    />
  );

  if (source?.type === 'upload') {
    return (
      <UploadImg
        src={source.value}
        alt={label}
        className="home-module-icon"
        onErrorFallback={defaultImg}
      />
    );
  }

  const PackIcon = source?.type === 'pack' ? resolvePackIcon(source.value) : null;
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

  return defaultImg;
}

/**
 * Bottom-nav icon. Lucide icons (default/pack) inherit the link's color for
 * active state; uploaded images can't, so active state is shown by opacity.
 */
export function NavSlotIcon({
  slot,
  defaultIcon,
  size = 36,
  active = false,
}: {
  slot: FaceIconSlot;
  defaultIcon: LucideIcon;
  size?: number;
  active?: boolean;
}) {
  const source = useSlotSource(slot);
  const Default = defaultIcon;

  if (source?.type === 'upload') {
    return (
      <UploadImg
        src={source.value}
        alt=""
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          borderRadius: 8,
          opacity: active ? 1 : 0.55,
        }}
        onErrorFallback={<Default size={size} />}
      />
    );
  }

  const PackIcon = source?.type === 'pack' ? resolvePackIcon(source.value) : null;
  const Icon = PackIcon ?? Default;
  return <Icon size={size} />;
}

/** Home header logo: pod upload → SpiritDAO symbol. */
export function LogoSlot({ size = 80 }: { size?: number }) {
  const source = useSlotSource('logo');

  const defaultLogo = (
    <Image
      src="/images/spiritdaosymbol.png"
      alt="SpiritDAO Logo"
      className="home-logo"
      width={size}
      height={size}
      priority
    />
  );

  if (source?.type === 'upload') {
    return (
      <UploadImg
        src={source.value}
        alt="Community logo"
        className="home-logo"
        onErrorFallback={defaultLogo}
      />
    );
  }
  return defaultLogo;
}
