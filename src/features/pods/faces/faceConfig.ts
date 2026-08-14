// src/features/pods/faces/faceConfig.ts
// Shared constants + validation for the Pod Faces (custom appearance) module.
// See docs/spec-pod-faces.md. Pure constants/functions — safe to import from
// both client components and API routes.

/**
 * The color tokens a face may override. These map 1:1 onto the CSS custom
 * properties in src/app/globals.css (`--primary`, `--background`, …) that
 * Tailwind consumes as `hsl(var(--token))`. Anything outside this list is
 * rejected server-side.
 */
export const FACE_COLOR_TOKENS = [
  'primary',
  'primaryForeground',
  'background',
  'foreground',
  'secondary',
  'accent',
  'destructive',
] as const;

export type FaceColorToken = (typeof FACE_COLOR_TOKENS)[number];

/** Hex colors keyed by token, e.g. { primary: '#2F5D50' }. Partial — missing
 *  tokens fall back to the SpiritDAO default. */
export type FaceColors = Partial<Record<FaceColorToken, string>>;

/**
 * The icon slots a face may remap: the 12 home-screen module cards, the 4
 * bottom-nav items, and the header logo. Core pod-interface icons are
 * intentionally NOT slots — faces are surface-level only.
 */
export const FACE_ICON_SLOTS = [
  // Home screen — user modules
  'identity',
  'artifacts',
  'sensemaker',
  // Home screen — community modules
  'chat',
  'forum',
  'pods',
  'events',
  'members',
  'governance',
  'bounties',
  'knowledge',
  'pulse',
  // Bottom navigation (MobileBottomNav)
  'nav.home',
  'nav.claims',
  'nav.governance',
  'nav.alerts',
  // Header logo on /home
  'logo',
] as const;

export type FaceIconSlot = (typeof FACE_ICON_SLOTS)[number];

/**
 * Where a slot's icon comes from:
 *  - 'pack'   → "<packId>/<iconId>" into a curated lucide set (iconPacks.ts)
 *  - 'upload' → public URL of a pod-uploaded image in the pod-faces storage
 *               bucket (POST /api/pods/[id]/face/icon). Uploads take priority
 *               over packs per slot, and are the only source that can remap
 *               the 'logo' slot.
 */
export type FaceIconSource =
  | {
      type: 'pack';
      /** "<packId>/<iconId>", e.g. "linework/chat" */
      value: string;
    }
  | {
      type: 'upload';
      /** https URL served from the pod-faces public storage bucket */
      value: string;
    };

/** Upload constraints, enforced client- and server-side. */
export const FACE_ICON_UPLOAD = {
  bucket: 'pod-faces',
  maxBytes: 1024 * 1024, // 1MB — these render at ≤64px
  allowedTypes: ['image/png', 'image/jpeg', 'image/webp'] as const,
};

export type FaceIconMap = Partial<Record<FaceIconSlot, FaceIconSource>>;

/**
 * Custom menu names keyed by slot, e.g. { bounties: 'Quests' }. Renames the
 * home-grid module titles (and bottom-nav aria-labels); the logo slot has no
 * label so it can't be renamed. Missing slots keep their registry default.
 */
export type FaceLabelMap = Partial<Record<FaceIconSlot, string>>;

/** Menu labels render in a fixed-width grid tile — keep them short. */
export const FACE_LABEL_MAX_LENGTH = 20;

export type FaceStatus = 'draft' | 'published';

export interface PodFace {
  id: string;
  pod_id: string;
  colors: FaceColors;
  icon_map: FaceIconMap;
  label_map: FaceLabelMap;
  status: FaceStatus;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

/** The SpiritDAO default palette — what every token falls back to when a face
 *  doesn't override it. Hex equivalents of the :root values in globals.css. */
export const FACE_DEFAULT_COLORS: Record<FaceColorToken, string> = {
  primary: '#2F5D50',
  primaryForeground: '#F5F4ED',
  background: '#F5F4ED',
  foreground: '#1F453A',
  secondary: '#EEEBE2',
  accent: '#EEEBE2',
  destructive: '#8B3A3A',
};

// ── Validation ──────────────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const PACK_VALUE_RE = /^[a-z0-9-]+\/[a-z0-9.-]+$/;

export function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

/** WCAG relative luminance of a #RRGGBB color. */
function relativeLuminance(hex: string): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two #RRGGBB colors (1–21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** Token pairs that must meet WCAG AA (4.5:1) before a face can publish —
 *  text-on-surface combinations members will actually read. */
export const FACE_CONTRAST_PAIRS: Array<[FaceColorToken, FaceColorToken]> = [
  ['foreground', 'background'],
  ['primaryForeground', 'primary'],
];

export const FACE_MIN_CONTRAST = 4.5;

export interface FaceValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * Structural validation of a colors object: known tokens, valid hex values.
 * Contrast is checked separately (publish-time only) so drafts can be WIP.
 */
export function validateFaceColors(colors: unknown): FaceValidationResult {
  const errors: string[] = [];
  if (typeof colors !== 'object' || colors === null || Array.isArray(colors)) {
    return { ok: false, errors: ['colors must be an object'] };
  }
  for (const [key, value] of Object.entries(colors)) {
    if (!(FACE_COLOR_TOKENS as readonly string[]).includes(key)) {
      errors.push(`Unknown color token: ${key}`);
    } else if (!isValidHexColor(value)) {
      errors.push(`${key} must be a #RRGGBB hex color`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Publish-time contrast validation (WCAG AA). Only checks pairs where both
 *  tokens are present — absent tokens use defaults, which already pass. */
export function validateFaceContrast(colors: FaceColors): FaceValidationResult {
  const errors: string[] = [];
  for (const [fg, bg] of FACE_CONTRAST_PAIRS) {
    const a = colors[fg];
    const b = colors[bg];
    if (!a || !b) continue;
    const ratio = contrastRatio(a, b);
    if (ratio < FACE_MIN_CONTRAST) {
      errors.push(
        `${fg} on ${bg} has contrast ${ratio.toFixed(2)}:1 — minimum is ${FACE_MIN_CONTRAST}:1 (WCAG AA)`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Structural validation of an icon_map: known slots, pack or upload sources.
 * The API layer additionally verifies upload URLs point into OUR storage
 * bucket for THIS pod (it knows the env + podId; this shared check can't).
 */
export function validateFaceIconMap(iconMap: unknown): FaceValidationResult {
  const errors: string[] = [];
  if (typeof iconMap !== 'object' || iconMap === null || Array.isArray(iconMap)) {
    return { ok: false, errors: ['icon_map must be an object'] };
  }
  for (const [slot, source] of Object.entries(iconMap)) {
    if (!(FACE_ICON_SLOTS as readonly string[]).includes(slot)) {
      errors.push(`Unknown icon slot: ${slot}`);
      continue;
    }
    const src = source as { type?: string; value?: unknown } | null;
    if (typeof src !== 'object' || src === null) {
      errors.push(`${slot}: icon source must be an object`);
    } else if (src.type === 'pack') {
      if (typeof src.value !== 'string' || !PACK_VALUE_RE.test(src.value)) {
        errors.push(`${slot}: pack value must look like "<packId>/<iconId>"`);
      }
    } else if (src.type === 'upload') {
      if (
        typeof src.value !== 'string' ||
        !src.value.startsWith('https://') ||
        !src.value.includes(`/storage/v1/object/public/${FACE_ICON_UPLOAD.bucket}/`)
      ) {
        errors.push(`${slot}: upload value must be a pod-faces storage URL`);
      }
    } else {
      errors.push(`${slot}: icon source type must be 'pack' or 'upload'`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Structural validation of a label_map: known slots (logo excluded — it has
 * no label), non-empty trimmed strings within the length cap, no control
 * characters. The client drops blank entries before saving, so anything
 * empty that reaches the API is a malformed request, not a "reset".
 */
export function validateFaceLabelMap(labelMap: unknown): FaceValidationResult {
  const errors: string[] = [];
  if (typeof labelMap !== 'object' || labelMap === null || Array.isArray(labelMap)) {
    return { ok: false, errors: ['label_map must be an object'] };
  }
  for (const [slot, label] of Object.entries(labelMap)) {
    if (!(FACE_ICON_SLOTS as readonly string[]).includes(slot) || slot === 'logo') {
      errors.push(`Unknown label slot: ${slot}`);
      continue;
    }
    if (typeof label !== 'string' || label.trim().length === 0) {
      errors.push(`${slot}: label must be a non-empty string`);
    } else if (label.trim().length > FACE_LABEL_MAX_LENGTH) {
      errors.push(`${slot}: label must be at most ${FACE_LABEL_MAX_LENGTH} characters`);
    } else if (/[\u0000-\u001F\u007F]/.test(label)) {
      errors.push(`${slot}: label contains control characters`);
    }
  }
  return { ok: errors.length === 0, errors };
}
