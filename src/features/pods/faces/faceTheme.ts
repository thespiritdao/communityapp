// src/features/pods/faces/faceTheme.ts
// Runtime CSS-variable injection for Pod Faces (docs/spec-pod-faces.md §5.1).
// Maps the 7 face color tokens onto the app's CSS custom properties: the
// Tailwind HSL triplets in globals.css plus the derived --ock-* hex values
// OnchainKit components consume. Inline styles on <html> win over the
// stylesheet, so no Tailwind/build changes are needed — and faces override
// light mode only by design (spec §8).

'use client';

import type { FaceColors } from './faceConfig';

/** #RRGGBB → "H S% L%" (the space-separated triplet globals.css uses). */
export function hexToHslTriplet(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Darken a #RRGGBB color by a 0–1 factor (for hover/active derivations). */
export function darkenHex(hex: string, amount: number): string {
  const scale = (c: number) => Math.max(0, Math.round(c * (1 - amount)));
  const r = scale(parseInt(hex.slice(1, 3), 16));
  const g = scale(parseInt(hex.slice(3, 5), 16));
  const b = scale(parseInt(hex.slice(5, 7), 16));
  const to2 = (c: number) => c.toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/** Mix two #RRGGBB colors: t=1 → all a, t=0 → all b. */
export function mixHex(a: string, b: string, t: number): string {
  const ch = (i: number) =>
    Math.round(
      parseInt(a.slice(i, i + 2), 16) * t + parseInt(b.slice(i, i + 2), 16) * (1 - t),
    );
  const to2 = (c: number) => c.toString(16).padStart(2, '0');
  return `#${to2(ch(1))}${to2(ch(3))}${to2(ch(5))}`;
}

type VarValue = { name: string; value: string };

/** Face token → every CSS variable it drives. HSL triplets for the Tailwind
 *  tokens, raw hex for the --ock-* family. */
function varsForColors(colors: FaceColors): VarValue[] {
  const out: VarValue[] = [];
  const hsl = (name: string, hex: string) => out.push({ name, value: hexToHslTriplet(hex) });
  const raw = (name: string, value: string) => out.push({ name, value });

  if (colors.primary) {
    hsl('--primary', colors.primary);
    hsl('--ring', colors.primary);
    raw('--ock-bg-primary', colors.primary);
    raw('--ock-bg-primary-hover', darkenHex(colors.primary, 0.15));
    raw('--ock-bg-primary-active', darkenHex(colors.primary, 0.25));
    raw('--ock-text-primary', colors.primary);
    raw('--ock-icon-color-primary', colors.primary);
    raw('--ock-line-primary', colors.primary);
  }
  if (colors.primaryForeground) {
    hsl('--primary-foreground', colors.primaryForeground);
    raw('--ock-icon-color-inverse', colors.primaryForeground);
  }
  if (colors.background) {
    hsl('--background', colors.background);
    raw('--ock-bg-default', colors.background);
    raw('--ock-bg-default-hover', darkenHex(colors.background, 0.05));
    raw('--ock-bg-default-active', darkenHex(colors.background, 0.09));
  }
  if (colors.foreground) {
    hsl('--foreground', colors.foreground);
    hsl('--card-foreground', colors.foreground);
    raw('--ock-text-foreground', colors.foreground);
    raw('--ock-icon-color-foreground', colors.foreground);
  }
  if (colors.secondary) {
    hsl('--secondary', colors.secondary);
    hsl('--muted', colors.secondary);
  }
  if (colors.accent) {
    hsl('--accent', colors.accent);
    raw('--ock-bg-alternate', colors.accent);
    raw('--ock-bg-primary-washed', colors.accent);
  }
  if (colors.destructive) {
    hsl('--destructive', colors.destructive);
    raw('--ock-bg-error', colors.destructive);
    raw('--ock-text-error', colors.destructive);
    raw('--ock-icon-color-error', colors.destructive);
  }

  // Derived surface tokens (globals.css defaults are the exact legacy hexes;
  // these overrides give faces coherent equivalents):
  //  - subtle text / inactive nav = foreground pulled 25% toward background
  //  - section band 1 = the face's secondary; band 2 = secondary nudged 5%
  //    toward foreground so the two home bands stay distinct
  const fg = colors.foreground;
  const bg = colors.background;
  if (fg && bg) {
    const subtle = mixHex(fg, bg, 0.75);
    raw('--face-nav-inactive', subtle);
    raw('--face-text-subtle', subtle);
  }
  if (colors.secondary) {
    raw('--face-surface-1', colors.secondary);
    raw('--face-surface-2', mixHex(colors.secondary, fg ?? '#1F453A', 0.95));
  }
  return out;
}

// Every var a face may have set — cleared on revert so switching from a face
// back to the default (or between faces with different token subsets) never
// leaves stale overrides behind.
const ALL_FACE_VARS = [
  '--primary', '--ring', '--primary-foreground', '--background', '--foreground',
  '--card-foreground', '--secondary', '--muted', '--accent', '--destructive',
  '--ock-bg-primary', '--ock-bg-primary-hover', '--ock-bg-primary-active',
  '--ock-text-primary', '--ock-icon-color-primary', '--ock-line-primary',
  '--ock-icon-color-inverse', '--ock-bg-default', '--ock-bg-default-hover',
  '--ock-bg-default-active', '--ock-text-foreground', '--ock-icon-color-foreground',
  '--ock-bg-alternate', '--ock-bg-primary-washed', '--ock-bg-error',
  '--ock-text-error', '--ock-icon-color-error',
  '--face-nav-inactive', '--face-text-subtle', '--face-surface-1', '--face-surface-2',
];

export function applyFaceColors(colors: FaceColors): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  clearFaceColors();
  for (const { name, value } of varsForColors(colors)) {
    root.style.setProperty(name, value);
  }
}

export function clearFaceColors(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const name of ALL_FACE_VARS) {
    root.style.removeProperty(name);
  }
}
