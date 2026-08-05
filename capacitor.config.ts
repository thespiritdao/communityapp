import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config — iOS App Store shell (see
 * src/guides/deployment/APPLE_APP_STORE_READINESS.md).
 *
 * Remote-URL mode: the native shell loads the deployed app directly, so there
 * is no static export step and store builds stay in sync with Vercel deploys
 * automatically. The Capacitor bridge (native push, status bar, splash) is
 * injected into the remote page by the shell.
 *
 * appId matches the Android TWA package name (org.spiritdao.app) so both
 * stores share one identity.
 */
const config: CapacitorConfig = {
  appId: 'org.spiritdao.app',
  appName: 'SpiritDAO',
  // webDir is unused in remote-URL mode but required by the CLI; point it at
  // an existing folder rather than generating a fake dist.
  webDir: 'public',
  server: {
    url: 'https://app.spiritdao.org',
    // Domains the webview may navigate to directly (everything else opens in
    // the system browser — which is also what Apple prefers for payments).
    allowNavigation: ['app.spiritdao.org', '*.spiritdao.org'],
  },
  ios: {
    contentInset: 'automatic',
    // Required for LiveKit video: play camera/mic streams inline rather than
    // forcing fullscreen native playback.
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#2F5D50',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#2F5D50',
    },
  },
};

export default config;
