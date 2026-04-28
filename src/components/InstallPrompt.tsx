// src/components/InstallPrompt.tsx
'use client';

import { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA Install Prompt
 * Shows a banner encouraging users to install the app to their home screen
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [iosMode, setIosMode] = useState<'none' | 'safari' | 'other-browser'>('none');

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true) {
      setIsInstalled(true);
      return;
    }

    // Check URL parameter to force show prompt (for testing)
    const urlParams = new URLSearchParams(window.location.search);
    const forceShow = urlParams.get('showInstall') === 'true';

    // Suppress prompt for 7 days after dismissal
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed && !forceShow) {
      const dismissedDate = new Date(dismissed);
      const daysSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        return;
      }
    }

    // iOS path: beforeinstallprompt never fires on iOS, so drive the prompt manually.
    // Only Safari can Add to Home Screen; other iOS browsers (Chrome/Firefox/Brave) cannot.
    if (isIOS()) {
      const mode = isIOSSafari() ? 'safari' : 'other-browser';
      setIosMode(mode);
      const delay = forceShow ? 0 : 5000;
      const t = setTimeout(() => setShowPrompt(true), delay);
      return () => clearTimeout(t);
    }

    // Listen for install prompt event
    const handler = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);

      // Show prompt immediately if forced, otherwise after 5 seconds
      const delay = forceShow ? 0 : 5000;
      setTimeout(() => {
        setShowPrompt(true);
      }, delay);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful installation
    window.addEventListener('appinstalled', () => {
      console.log('✅ [PWA] App installed successfully');
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      console.log('[PWA] No install prompt available');
      return;
    }

    try {
      // Show native install prompt
      await deferredPrompt.prompt();

      // Wait for user choice
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        console.log('✅ [PWA] User accepted install');
      } else {
        console.log('⏭️ [PWA] User dismissed install');
      }

      // Clear prompt
      setDeferredPrompt(null);
      setShowPrompt(false);
    } catch (error) {
      console.error('❌ [PWA] Error showing install prompt:', error);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
  };

  // Don't show if already installed or banner not yet ready
  if (isInstalled || !showPrompt) {
    return null;
  }

  // iOS path: show manual Add-to-Home-Screen instructions (or a "switch to Safari" hint)
  if (iosMode !== 'none') {
    return (
      <div
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white dark:bg-gray-800 shadow-2xl rounded-lg border border-gray-200 dark:border-gray-700 z-[9999] animate-slide-up"
        role="dialog"
        aria-labelledby="install-prompt-title"
        aria-describedby="install-prompt-description"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          aria-label="Dismiss install prompt"
        >
          <X size={20} />
        </button>

        <div className="p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="flex-shrink-0">
              <img src="/icons/icon-96.png" alt="SpiritDAO" className="w-12 h-12 rounded-lg" />
            </div>
            <div className="flex-1 min-w-0">
              <h3
                id="install-prompt-title"
                className="text-lg font-semibold text-gray-900 dark:text-white mb-1"
              >
                Install SpiritDAO
              </h3>
              <p
                id="install-prompt-description"
                className="text-sm text-gray-600 dark:text-gray-300"
              >
                {iosMode === 'safari'
                  ? 'Add SpiritDAO to your home screen for quick access and a full-screen experience.'
                  : 'To install SpiritDAO on iPhone, open this page in Safari first.'}
              </p>
            </div>
          </div>

          {iosMode === 'safari' ? (
            <ol className="mb-4 space-y-2 text-sm text-gray-700 dark:text-gray-300 list-decimal list-inside">
              <li className="flex items-center gap-2">
                <span>Tap the Share button</span>
                <svg className="inline w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 5l-1.42 1.42-1.59-1.59V16h-1.98V4.83L9.42 6.42 8 5l4-4 4 4zm4 5v11c0 1.1-.9 2-2 2H6c-1.11 0-2-.9-2-2V10c0-1.11.89-2 2-2h3v2H6v11h12V10h-3V8h3c1.1 0 2 .89 2 2z" />
                </svg>
                <span>at the bottom of Safari</span>
              </li>
              <li>Scroll and tap <strong>"Add to Home Screen"</strong></li>
              <li>Tap <strong>"Add"</strong> in the top-right corner</li>
            </ol>
          ) : (
            <p className="mb-4 text-sm text-gray-700 dark:text-gray-300">
              On iPhone and iPad, only Safari can install web apps to the home screen.
              Copy this URL into Safari and tap Share → Add to Home Screen.
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleDismiss}
              className="flex-1 px-4 py-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Chrome/Android path: requires the captured beforeinstallprompt event
  if (!deferredPrompt) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white dark:bg-gray-800 shadow-2xl rounded-lg border border-gray-200 dark:border-gray-700 z-[9999] animate-slide-up"
      role="dialog"
      aria-labelledby="install-prompt-title"
      aria-describedby="install-prompt-description"
    >
      {/* Close button */}
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        aria-label="Dismiss install prompt"
      >
        <X size={20} />
      </button>

      <div className="p-5">
        {/* Header with icon */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0">
            <img
              src="/icons/icon-96.png"
              alt="SpiritDAO"
              className="w-12 h-12 rounded-lg"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="install-prompt-title"
              className="text-lg font-semibold text-gray-900 dark:text-white mb-1"
            >
              Install SpiritDAO
            </h3>
            <p
              id="install-prompt-description"
              className="text-sm text-gray-600 dark:text-gray-300"
            >
              Add to your home screen for quick access, offline support, and push notifications
            </p>
          </div>
        </div>

        {/* Benefits list */}
        <ul className="mb-4 space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
          <li className="flex items-center gap-2">
            <span className="text-green-500">✓</span>
            <span>Instant access from your home screen</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-500">✓</span>
            <span>Works offline with cached content</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-500">✓</span>
            <span>Get notifications for bounties & messages</span>
          </li>
        </ul>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleInstall}
            className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-lg font-medium transition-colors"
          >
            <Download size={18} />
            Install App
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-2.5 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium transition-colors"
          >
            Not now
          </button>
        </div>
      </div>

    </div>
  );
}

// Helper: Detect iOS (iPhone/iPad/iPod, including iPadOS reporting as MacIntel)
function isIOS(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

// Helper: Detect iOS Safari (only Safari can Add to Home Screen on iOS).
// Chrome (CriOS), Firefox (FxiOS), Edge (EdgiOS), Brave, etc. on iOS cannot install PWAs.
function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line/.test(ua);
  return isIOS() && isSafari;
}

// Add animation styles to global CSS
const styles = `
@keyframes slide-up {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}
`;

// Inject styles (only in browser)
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
