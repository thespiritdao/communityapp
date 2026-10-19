/**
 * Onboarding tracks — Phase A.
 *
 * A member picks an intent once (join / found / explore). Each intent maps
 * to a short ordered checklist. An item's `done` is computed from live
 * state passed in as `TrackFacts`; the only stored progress is the set of
 * routes the member has opened (`onboarding_visited`).
 *
 * Scope: docs/onboarding-redo-phase-a-scope-2026-10-19.md
 */

export type OnboardingIntent = 'join' | 'found' | 'explore';

export const INTENT_OPTIONS: {
  value: OnboardingIntent;
  title: string;
  blurb: string;
}[] = [
  { value: 'join', title: 'Join a community', blurb: 'Find a pod and the people in it.' },
  { value: 'found', title: 'Found a community', blurb: 'Start a pod and invite others.' },
  { value: 'explore', title: 'Just explore', blurb: 'Look around first, decide later.' },
];

export const INTENT_TITLES: Record<OnboardingIntent, string> = {
  join: 'Joining a community',
  found: 'Founding a community',
  explore: 'Exploring SpiritDAO',
};

/**
 * Route keys stored in onboarding_visited. VisitRecorder maps pathnames to
 * these; tracks reference them by key so a path change is a one-line fix.
 */
export type VisitKey =
  | 'identity'
  | 'members'
  | 'chat'
  | 'forum'
  | 'knowledge'
  | 'explorer'
  | 'pods'
  | 'pods-manage'
  | 'sensemaker';

export function visitKeyForPath(pathname: string): VisitKey | null {
  if (pathname === '/identity') return 'identity';
  if (pathname === '/members') return 'members';
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return 'chat';
  if (pathname === '/forum' || pathname.startsWith('/forum/')) return 'forum';
  if (pathname === '/knowledge' || pathname.startsWith('/knowledge/')) return 'knowledge';
  if (pathname === '/explorer') return 'explorer';
  if (pathname === '/sensemaker-ai') return 'sensemaker';
  if (/^\/pods\/[^/]+\/manage(\/|$)/.test(pathname)) return 'pods-manage';
  if (pathname === '/pods' || pathname.startsWith('/pods/')) return 'pods';
  return null;
}

/** Live state a track needs to decide which items are done. */
export interface TrackFacts {
  hasName: boolean;
  hasPhoto: boolean;
  hasBio: boolean;
  hasSeeking: boolean;
  inAnyPod: boolean;
  leadsAnyPod: boolean;
  visited: Partial<Record<VisitKey, string>>;
}

export interface TrackItemDef {
  id: string;
  label: string;
  /** One line under the label. */
  hint: string;
  /** Where the primary button goes. Null for the re-ask item. */
  href: string | null;
  /** `data-tour` id of the home icon "Show me" spotlights, if any. */
  tourId?: string;
  done: (f: TrackFacts) => boolean;
}

export interface TrackItem extends Omit<TrackItemDef, 'done'> {
  done: boolean;
}

const nameAndPhoto: TrackItemDef = {
  id: 'name-photo',
  label: 'Add your name and photo',
  hint: 'So members see a person, not an address.',
  href: '/identity',
  tourId: 'identity',
  done: (f) => f.hasName && f.hasPhoto,
};

const visited = (key: VisitKey) => (f: TrackFacts) => Boolean(f.visited[key]);

export const TRACKS: Record<OnboardingIntent, TrackItemDef[]> = {
  join: [
    nameAndPhoto,
    {
      id: 'seeking',
      label: "Say what you're seeking",
      hint: 'A few checkboxes on your profile. Pods use this to find you.',
      href: '/identity',
      tourId: 'identity',
      done: (f) => f.hasSeeking,
    },
    {
      id: 'members',
      label: 'Meet the members',
      hint: "See who's here and who's open to collaborate.",
      href: '/members',
      tourId: 'members',
      done: visited('members'),
    },
    {
      id: 'pod',
      label: 'Find a pod',
      hint: 'Browse the working groups and join one.',
      href: '/pods',
      tourId: 'pods',
      done: (f) => f.inAnyPod,
    },
    {
      id: 'chat',
      label: 'Say hello in General chat',
      hint: 'Everyone is in General. One line is enough.',
      href: '/chat',
      tourId: 'chat',
      done: visited('chat'),
    },
  ],
  found: [
    nameAndPhoto,
    {
      id: 'bio',
      label: 'Add a bio',
      hint: 'People join founders they can read about.',
      href: '/identity',
      tourId: 'identity',
      done: (f) => f.hasBio,
    },
    {
      id: 'pods',
      label: 'See how pods work',
      hint: 'Each pod has its own members, treasury, and governance.',
      href: '/pods',
      tourId: 'pods',
      done: visited('pods'),
    },
    {
      id: 'create',
      label: 'Create your pod',
      hint: 'Name it, pick a look, set the agreements.',
      href: '/pods/create-with-modules',
      tourId: 'pods',
      done: (f) => f.leadsAnyPod,
    },
    {
      id: 'invite',
      label: 'Open your pod settings and share an invite link',
      hint: 'Members join through a link you create.',
      href: '/pods',
      tourId: 'pods',
      done: visited('pods-manage'),
    },
  ],
  explore: [
    {
      id: 'sensemaker',
      label: 'Ask Sensemaker one question',
      hint: 'It knows Temporal Naturalism and how SpiritDAO works.',
      href: '/sensemaker-ai',
      tourId: 'sensemaker',
      done: visited('sensemaker'),
    },
    {
      id: 'knowledge',
      label: 'Browse the Knowledge Base',
      hint: 'Guides, research, and the living library.',
      href: '/knowledge',
      tourId: 'knowledge',
      done: visited('knowledge'),
    },
    {
      id: 'forum',
      label: 'Read the Forum',
      hint: 'Long-form discussion and proposals.',
      href: '/forum',
      tourId: 'forum',
      done: visited('forum'),
    },
    {
      id: 'pulse',
      label: 'Watch the Pulse',
      hint: 'Everything happening across SpiritDAO, live.',
      href: '/explorer',
      tourId: 'pulse',
      done: visited('explorer'),
    },
    {
      id: 'reask',
      label: 'Ready to join or found a community?',
      hint: 'Pick a path and the checklist changes with you.',
      href: null,
      done: () => false,
    },
  ],
};

export function buildTrack(intent: OnboardingIntent, facts: TrackFacts): TrackItem[] {
  return TRACKS[intent].map(({ done, ...rest }) => ({ ...rest, done: done(facts) }));
}
