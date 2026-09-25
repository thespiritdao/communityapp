// src/lib/safeAppPath.ts
// Notification links (context_url) must stay on the app. They are joined to
// APP_URL in digest emails and opened on push-notification tap, so a value
// like '.evil.com/x' or '//evil.com' would send members off-site from mail
// the DAO sent. The database enforces the same rule (is_safe_app_path).

/** A same-site path: starts with one '/', not '//', no backslash. */
export function isSafeAppPath(p: unknown): p is string {
  return typeof p === 'string' && /^\/(?!\/)/.test(p) && !p.includes('\\');
}

/** The path if safe, otherwise null. */
export function safeAppPath(p: unknown): string | null {
  return isSafeAppPath(p) ? p : null;
}

/** Absolute URL on `base` for a safe path, or null. */
export function appUrl(base: string, p: unknown): string | null {
  if (!isSafeAppPath(p)) return null;
  const url = new URL(p, base);
  return url.origin === new URL(base).origin ? url.toString() : null;
}
