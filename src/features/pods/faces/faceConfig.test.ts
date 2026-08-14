// Unit tests for Pod Faces validation + color math (docs/spec-pod-faces.md).
// These functions gate what the API accepts and what publishes — the contrast
// check in particular is the accessibility floor for every community face.

import { describe, it, expect } from 'vitest';
import {
  FACE_DEFAULT_COLORS,
  FACE_ICON_SLOTS,
  FACE_LABEL_MAX_LENGTH,
  contrastRatio,
  validateFaceColors,
  validateFaceContrast,
  validateFaceIconMap,
  validateFaceLabelMap,
} from './faceConfig';
import { hexToHslTriplet, darkenHex, mixHex } from './faceTheme';
import { ICON_PACKS, resolvePackIcon } from '@/config/iconPacks';

describe('validateFaceColors', () => {
  it('accepts the default palette', () => {
    expect(validateFaceColors(FACE_DEFAULT_COLORS).ok).toBe(true);
  });

  it('rejects unknown tokens', () => {
    const result = validateFaceColors({ neonGlow: '#FF00FF' });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('neonGlow');
  });

  it('rejects malformed hex values', () => {
    expect(validateFaceColors({ primary: 'green' }).ok).toBe(false);
    expect(validateFaceColors({ primary: '#FFF' }).ok).toBe(false); // shorthand not allowed
    expect(validateFaceColors({ primary: '#GGGGGG' }).ok).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(validateFaceColors(null).ok).toBe(false);
    expect(validateFaceColors(['#FFFFFF']).ok).toBe(false);
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white and 1:1 for identical colors', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#2F5D50', '#2F5D50')).toBe(1);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#2F5D50', '#F5F4ED')).toBeCloseTo(
      contrastRatio('#F5F4ED', '#2F5D50'),
      5,
    );
  });
});

describe('validateFaceContrast', () => {
  it('passes the default palette', () => {
    expect(validateFaceContrast(FACE_DEFAULT_COLORS).ok).toBe(true);
  });

  it('fails white-on-white text', () => {
    const result = validateFaceContrast({
      foreground: '#FFFFFF',
      background: '#FFFFEE',
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('foreground');
  });

  it('skips pairs where a token is absent (defaults already pass)', () => {
    expect(validateFaceContrast({ foreground: '#FFFFFF' }).ok).toBe(true);
  });
});

describe('validateFaceIconMap', () => {
  it('accepts a pack mapping for a known slot', () => {
    expect(
      validateFaceIconMap({ chat: { type: 'pack', value: 'linework/chat' } }).ok,
    ).toBe(true);
  });

  it('accepts dotted nav slots', () => {
    expect(
      validateFaceIconMap({
        'nav.home': { type: 'pack', value: 'cosmos/nav.home' },
      }).ok,
    ).toBe(true);
  });

  it('accepts upload sources pointing at the pod-faces bucket', () => {
    expect(
      validateFaceIconMap({
        chat: {
          type: 'upload',
          value: 'https://x.supabase.co/storage/v1/object/public/pod-faces/pod-1/chat-123.png',
        },
      }).ok,
    ).toBe(true);
  });

  it('accepts logo uploads (the one slot packs cannot cover)', () => {
    expect(
      validateFaceIconMap({
        logo: {
          type: 'upload',
          value: 'https://x.supabase.co/storage/v1/object/public/pod-faces/pod-1/logo-9.webp',
        },
      }).ok,
    ).toBe(true);
  });

  it('rejects unknown slots, foreign upload URLs, and malformed values', () => {
    expect(validateFaceIconMap({ settings: { type: 'pack', value: 'linework/settings' } }).ok).toBe(false);
    expect(validateFaceIconMap({ chat: { type: 'upload', value: 'https://evil.example/y.png' } }).ok).toBe(false);
    expect(validateFaceIconMap({ chat: { type: 'upload', value: 'http://x.supabase.co/storage/v1/object/public/pod-faces/p/y.png' } }).ok).toBe(false);
    expect(validateFaceIconMap({ chat: { type: 'sticker', value: 'x' } }).ok).toBe(false);
    expect(validateFaceIconMap({ chat: { type: 'pack', value: 'no-slash' } }).ok).toBe(false);
  });
});

describe('validateFaceLabelMap', () => {
  it('accepts renames for home-grid and nav slots', () => {
    expect(
      validateFaceLabelMap({ bounties: 'Quests', 'nav.claims': 'Care' }).ok,
    ).toBe(true);
  });

  it('accepts an empty map (no renames)', () => {
    expect(validateFaceLabelMap({}).ok).toBe(true);
  });

  it('rejects the logo slot and unknown slots', () => {
    expect(validateFaceLabelMap({ logo: 'Us' }).ok).toBe(false);
    expect(validateFaceLabelMap({ settings: 'Config' }).ok).toBe(false);
  });

  it('rejects empty, whitespace-only, and non-string labels', () => {
    expect(validateFaceLabelMap({ chat: '' }).ok).toBe(false);
    expect(validateFaceLabelMap({ chat: '   ' }).ok).toBe(false);
    expect(validateFaceLabelMap({ chat: 42 }).ok).toBe(false);
  });

  it('rejects labels over the length cap (trimmed)', () => {
    expect(
      validateFaceLabelMap({ chat: 'x'.repeat(FACE_LABEL_MAX_LENGTH) }).ok,
    ).toBe(true);
    expect(
      validateFaceLabelMap({ chat: 'x'.repeat(FACE_LABEL_MAX_LENGTH + 1) }).ok,
    ).toBe(false);
  });

  it('rejects control characters', () => {
    expect(validateFaceLabelMap({ chat: 'Ch\tat' }).ok).toBe(false);
    expect(validateFaceLabelMap({ chat: `Chat${String.fromCharCode(0)}` }).ok).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(validateFaceLabelMap(null).ok).toBe(false);
    expect(validateFaceLabelMap(['Chat']).ok).toBe(false);
  });
});

describe('icon packs', () => {
  it('every pack covers every remappable slot', () => {
    const packSlots = FACE_ICON_SLOTS.filter((s) => s !== 'logo');
    for (const pack of Object.values(ICON_PACKS)) {
      for (const slot of packSlots) {
        expect(resolvePackIcon(`${pack.id}/${slot}`), `${pack.id}/${slot}`).toBeTruthy();
      }
    }
  });

  it('unknown packs resolve to null (fallback, not crash)', () => {
    expect(resolvePackIcon('deleted-pack/chat')).toBeNull();
    expect(resolvePackIcon('linework/not-a-slot')).toBeNull();
    expect(resolvePackIcon('noslash')).toBeNull();
  });
});

describe('faceTheme color math', () => {
  it('converts hex to the HSL triplet format globals.css uses', () => {
    expect(hexToHslTriplet('#FFFFFF')).toBe('0 0% 100%');
    expect(hexToHslTriplet('#000000')).toBe('0 0% 0%');
    expect(hexToHslTriplet('#2F5D50')).toBe('163 33% 27%');
  });

  it('darkens without underflowing', () => {
    expect(darkenHex('#FFFFFF', 0.5)).toBe('#808080');
    expect(darkenHex('#000000', 0.5)).toBe('#000000');
    expect(darkenHex('#2F5D50', 0)).toBe('#2f5d50');
  });

  it('mixes colors linearly (surface-token derivations)', () => {
    expect(mixHex('#000000', '#FFFFFF', 1)).toBe('#000000');
    expect(mixHex('#000000', '#FFFFFF', 0)).toBe('#ffffff');
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });
});
