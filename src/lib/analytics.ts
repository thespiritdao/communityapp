// src/lib/analytics.ts
//
// Thin wrapper around the GA4 tag loaded in app/layout.tsx.
//
// Scope is deliberately narrow: the tag exists so Google Ads (Ad Grants) can
// attribute sign-ups to campaigns via GA4 key events and cross-domain
// measurement with spiritdao.org. It is NOT the app's analytics layer; member
// activity lives in Supabase. Only fire events here that Ads needs.
//
// Every call is a no-op when the tag is absent (dev, blocked, SSR).

/** GA4 measurement ID (NEXT_PUBLIC_GA_MEASUREMENT_ID); analytics is off when unset. */
export { GA_MEASUREMENT_ID } from '@/config/deployment';

type GtagFn = (...args: unknown[]) => void;

function getGtag(): GtagFn | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const g = (window as unknown as { gtag?: unknown }).gtag;
  return typeof g === 'function' ? (g as GtagFn) : null;
}

/** Send a GA4 event. Never throws. */
export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean>,
): void {
  const gtag = getGtag();
  if (!gtag) {
    return;
  }
  try {
    gtag('event', name, params ?? {});
  } catch {
    // analytics must never break the app
  }
}
