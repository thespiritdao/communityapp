// src/config/moduleRegistry.ts
// Config-driven definitions for the main-screen module grid (src/app/home)
// and the bottom navigation (MobileBottomNav). Extracted from hardcoded JSX
// so Pod Faces can remap icons per slot (docs/spec-pod-faces.md §5.2).
// The slot keys here are the FACE_ICON_SLOTS in faceConfig.ts.

import type { LucideIcon } from 'lucide-react';
import { Home, Vote, Bell, HeartHandshake } from 'lucide-react';
import type { FaceIconSlot } from '@/features/pods/faces/faceConfig';

export interface HomeModuleDef {
  slot: FaceIconSlot;
  href: string;
  label: string;
  /** Default PNG under /public — used when no face remaps this slot. */
  defaultIcon: string;
  tourId: string;
  /** Above-the-fold user modules load eagerly; the rest lazily. */
  eager?: boolean;
}

export const HOME_USER_MODULES: HomeModuleDef[] = [
  { slot: 'identity', href: '/identity', label: 'Identity', defaultIcon: '/images/icons/identityicon.png', tourId: 'identity', eager: true },
  { slot: 'artifacts', href: '/market', label: 'Artifacts', defaultIcon: '/images/icons/artifactsicon.png', tourId: 'artifacts', eager: true },
  { slot: 'sensemaker', href: '/sensemaker-ai', label: 'Sensemaker', defaultIcon: '/images/sensemakeraikey.png', tourId: 'sensemaker', eager: true },
];

export const HOME_COMMUNITY_MODULES: HomeModuleDef[] = [
  { slot: 'chat', href: '/chat', label: 'Chat', defaultIcon: '/images/icons/chaticon.png', tourId: 'chat' },
  { slot: 'forum', href: '/forum', label: 'Forum', defaultIcon: '/images/icons/forumicon.png', tourId: 'forum' },
  { slot: 'pods', href: '/pods', label: 'Pods', defaultIcon: '/images/icons/podsicon.png', tourId: 'pods' },
  { slot: 'events', href: '/events', label: 'Events', defaultIcon: '/images/icons/eventsicon.png', tourId: 'events' },
  { slot: 'members', href: '/members', label: 'Members', defaultIcon: '/images/icons/membersicon.png', tourId: 'members' },
  { slot: 'governance', href: '/governance', label: 'Governance', defaultIcon: '/images/icons/governanceicon.png', tourId: 'governance' },
  { slot: 'bounties', href: '/bounty', label: 'Bounties', defaultIcon: '/images/icons/bountiesicon.png', tourId: 'bounties' },
  { slot: 'knowledge', href: '/knowledge', label: 'Knowledge', defaultIcon: '/images/icons/knowledgebaseicon.png', tourId: 'knowledge' },
  { slot: 'pulse', href: '/explorer', label: 'Pulse', defaultIcon: '/images/icons/pulseicon.png', tourId: 'pulse' },
];

export interface NavItemDef {
  slot: FaceIconSlot;
  href: string;
  label: string;
  match: 'exact' | 'startsWith';
  defaultIcon: LucideIcon;
}

export const BOTTOM_NAV_ITEMS: NavItemDef[] = [
  { slot: 'nav.home', href: '/home', label: 'Home', match: 'startsWith', defaultIcon: Home },
  { slot: 'nav.claims', href: '/claims', label: 'Claims', match: 'startsWith', defaultIcon: HeartHandshake },
  { slot: 'nav.governance', href: '/governance', label: 'Govern', match: 'startsWith', defaultIcon: Vote },
  { slot: 'nav.alerts', href: '/notifications', label: 'Alerts', match: 'startsWith', defaultIcon: Bell },
];
