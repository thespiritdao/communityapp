// src/config/iconPacks.ts
// Curated icon packs for Pod Faces (docs/spec-pod-faces.md §5.2).
// Packs are complete lucide-react sets — every remappable slot has an icon —
// so any pack a leader applies is guaranteed visually coherent. Custom
// uploads are a deferred later phase (spec §8).
//
// icon_map values are "<packId>/<slot>", e.g. "linework/chat". The slot is
// repeated in the value so the stored face is self-describing and validation
// (faceConfig.PACK_VALUE_RE) stays a pure string check.

import type { LucideIcon } from 'lucide-react';
import {
  // linework pack
  Fingerprint,
  Gem,
  Brain,
  MessageCircle,
  Newspaper,
  Shapes,
  CalendarDays,
  Users,
  Scale,
  Target,
  Library,
  Activity,
  Home,
  HeartHandshake,
  Bell,
  // cosmos pack
  Sparkles,
  Package,
  Wand2,
  MessagesSquare,
  Megaphone,
  Hexagon,
  Sun,
  UsersRound,
  Landmark,
  Trophy,
  BookOpen,
  Radar,
  Compass,
  HandCoins,
  BellRing,
} from 'lucide-react';
import type { FaceIconSlot } from '@/features/pods/faces/faceConfig';

/** Slots packs must cover — every remappable slot except the logo (a pod
 *  cannot get a bespoke logo from a generic pack; logo remap ships with
 *  custom uploads). */
export type PackSlot = Exclude<FaceIconSlot, 'logo'>;

export interface IconPack {
  id: string;
  label: string;
  description: string;
  icons: Record<PackSlot, LucideIcon>;
}

export const ICON_PACKS: Record<string, IconPack> = {
  linework: {
    id: 'linework',
    label: 'Linework',
    description: 'Clean, literal outline icons',
    icons: {
      identity: Fingerprint,
      artifacts: Gem,
      sensemaker: Brain,
      chat: MessageCircle,
      forum: Newspaper,
      pods: Shapes,
      events: CalendarDays,
      members: Users,
      governance: Scale,
      bounties: Target,
      knowledge: Library,
      pulse: Activity,
      'nav.home': Home,
      'nav.claims': HeartHandshake,
      'nav.governance': Scale,
      'nav.alerts': Bell,
    },
  },
  cosmos: {
    id: 'cosmos',
    label: 'Cosmos',
    description: 'Playful, expressive symbols',
    icons: {
      identity: Sparkles,
      artifacts: Package,
      sensemaker: Wand2,
      chat: MessagesSquare,
      forum: Megaphone,
      pods: Hexagon,
      events: Sun,
      members: UsersRound,
      governance: Landmark,
      bounties: Trophy,
      knowledge: BookOpen,
      pulse: Radar,
      'nav.home': Compass,
      'nav.claims': HandCoins,
      'nav.governance': Landmark,
      'nav.alerts': BellRing,
    },
  },
};

/**
 * Resolve an icon_map pack value ("<packId>/<slot>") to a lucide component.
 * Returns null for unknown packs/slots so callers fall back to the default —
 * a face referencing a since-removed pack must degrade, not crash.
 */
export function resolvePackIcon(value: string): LucideIcon | null {
  const slash = value.indexOf('/');
  if (slash === -1) return null;
  const packId = value.slice(0, slash);
  const iconId = value.slice(slash + 1);
  return ICON_PACKS[packId]?.icons[iconId as PackSlot] ?? null;
}
