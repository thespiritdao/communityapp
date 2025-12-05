// src/utils/browserDetection.ts

/**
 * Browser Detection and Compatibility Utilities
 *
 * Helps detect browser-specific issues that might affect wallet authentication,
 * particularly for Firefox which has stricter privacy/timeout settings.
 */

/**
 * Detect if the user is on Firefox
 */
export function isFirefox(): boolean {
  if (typeof window === 'undefined') return false;
  return navigator.userAgent.toLowerCase().includes('firefox');
}

/**
 * Detect if the user is on Chrome (or Chromium-based browser)
 */
export function isChrome(): boolean {
  if (typeof window === 'undefined') return false;
  return navigator.userAgent.toLowerCase().includes('chrome') && !isFirefox();
}

/**
 * Detect Firefox-specific privacy/compatibility issues
 * Returns an error message if an issue is detected, null otherwise
 */
export function detectFirefoxPrivacyIssues(): string | null {
  if (!isFirefox()) return null;

  // Check if localStorage is accessible (blocked in private browsing or strict mode)
  try {
    localStorage.setItem('firefox_test', 'test');
    localStorage.removeItem('firefox_test');
  } catch (e) {
    console.warn('[Firefox] localStorage not accessible:', e);
    return 'Firefox Private Browsing or storage restrictions detected. Please allow storage for this site in Firefox settings.';
  }

  // Check if cookies are enabled
  if (!navigator.cookieEnabled) {
    console.warn('[Firefox] Cookies are disabled');
    return 'Cookies are disabled. Please enable cookies in Firefox settings to use wallet authentication.';
  }

  // Check if third-party storage is blocked (Enhanced Tracking Protection)
  try {
    // This is a proxy check - if we can't access indexedDB, ETP is likely blocking
    if (typeof indexedDB === 'undefined') {
      console.warn('[Firefox] IndexedDB not available - Enhanced Tracking Protection may be active');
      return 'Firefox Enhanced Tracking Protection may be blocking wallet connection. Try adding this site to your exceptions.';
    }
  } catch (e) {
    console.warn('[Firefox] Storage access check failed:', e);
  }

  return null;
}

/**
 * Get browser name for logging/analytics
 */
export function getBrowserName(): string {
  if (typeof window === 'undefined') return 'server';

  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('firefox')) return 'firefox';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'safari';
  if (ua.includes('chrome')) return 'chrome';
  if (ua.includes('edge')) return 'edge';

  return 'unknown';
}

/**
 * Log browser-specific information for debugging
 */
export function logBrowserInfo() {
  if (typeof window === 'undefined') return;

  const info = {
    browser: getBrowserName(),
    userAgent: navigator.userAgent,
    cookiesEnabled: navigator.cookieEnabled,
    language: navigator.language,
    platform: navigator.platform,
    onLine: navigator.onLine,
  };

  console.log('[Browser] Info:', info);

  // Check for potential issues
  const firefoxIssue = detectFirefoxPrivacyIssues();
  if (firefoxIssue) {
    console.warn('[Browser] Potential issue detected:', firefoxIssue);
  }
}
