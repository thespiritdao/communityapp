// src/app/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import '@/styles/transactionStyles.css';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/features/identity';
import { walletVerificationService } from '@/services/walletVerificationService';
import { usePersistentWalletConnection } from '@/hooks/usePersistentWalletConnection';
import { InviteCodeModal } from '@/components/InviteCodeModal';
import {
  isFirstUser,
  hasCompletedOnboarding,
  updateUserWithReferrer,
} from '@/services/inviteCodeService';
import { ConnectWallet } from '@/wallet/components/ConnectWallet';
import { WalletProvider } from '@/wallet/components/WalletProvider';

export default function Page() {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    setIsInitialized(true);
  }, []);

  if (!isInitialized) {
    return <div>Loading...</div>;
  }

  return <PageContent />;
}

function PageContent() {
  // useAccount returns the connected wallet address and connection state.
  const { address, isConnecting, isDisconnected, connector } = useAccount();
  const { disconnect } = useDisconnect();
  const router = useRouter();

  // Use centralized auth system
  const { isAuthenticated, signIn, loading: authLoading } = useAuthContext();

  // Local state: track wallet verification and redirect
  const [hasRedirected, setHasRedirected] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isSmartWallet, setIsSmartWallet] = useState(false);
  const [isVerifyingWallet, setIsVerifyingWallet] = useState(false);
  const [isVerificationComplete, setIsVerificationComplete] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const verificationRef = useRef({ isComplete: false, isSmartWallet: false });
  const authenticationAttemptedRef = useRef(false); // Track if auth was already attempted
  const connectionAttemptsRef = useRef(0); // Track connection attempts to detect loops
  // Also track client-side mounting to avoid SSR hydration issues.
  const [isClient, setIsClient] = useState(false);
  const [isFirefox, setIsFirefox] = useState(false);
  const [showPopupWarning, setShowPopupWarning] = useState(false);
  const [hasCoinbaseWallet, setHasCoinbaseWallet] = useState<boolean | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isPrivateBrowsing, setIsPrivateBrowsing] = useState(false);

  // Invite code modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isFirstUserAccount, setIsFirstUserAccount] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // Detect Firefox browser
    const isFirefoxBrowser = navigator.userAgent.toLowerCase().includes('firefox');
    setIsFirefox(isFirefoxBrowser);

    if (isFirefoxBrowser) {
      console.warn('Firefox detected - Coinbase Wallet SDK has limited support');
    }

    // CRITICAL: Detect private/incognito browsing mode
    const detectPrivateBrowsing = async () => {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (!isMobile) {
        // Desktop - private mode is OK (passkeys work)
        return false;
      }

      // Mobile private browsing detection
      let isPrivate = false;

      // Method 1: Check localStorage
      try {
        localStorage.setItem('__test__', 'test');
        localStorage.removeItem('__test__');
      } catch (e) {
        isPrivate = true; // Some browsers disable localStorage in private mode
      }

      // Method 2: Check IndexedDB (more reliable)
      if (!isPrivate && 'indexedDB' in window) {
        try {
          const testDB = window.indexedDB.open('test');
          testDB.onerror = () => {
            isPrivate = true;
          };
        } catch (e) {
          isPrivate = true;
        }
      }

      // Method 3: Check for missing features that private mode disables
      if (!isPrivate) {
        // Safari private mode has limited quota
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          try {
            const estimate = await navigator.storage.estimate();
            // Safari private mode quota is very low
            if (estimate.quota && estimate.quota < 120000000) {
              isPrivate = true;
            }
          } catch (e) {
            // Estimation failed, might be private
          }
        }
      }

      console.log('🔒 Private browsing detection:', { isPrivate, isMobile });
      return isPrivate;
    };

    // CRITICAL: Detect if Coinbase Wallet app is installed on mobile
    const detectCoinbaseWallet = async () => {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      // First check for private browsing on mobile
      if (isMobile) {
        const isPrivate = await detectPrivateBrowsing();
        if (isPrivate) {
          console.warn('⚠️ Private browsing detected on mobile - deep linking will not work');
          setIsPrivateBrowsing(true);
          return;
        }
      }

      if (!isMobile) {
        // Desktop - passkeys should work, allow connection
        console.log('🖥️ Desktop detected - passkeys available');
        setHasCoinbaseWallet(true);
        return;
      }

      // Mobile detection - check for Coinbase Wallet deep link support
      // The SDK sets window.coinbaseWalletExtension when app is installed
      const hasCoinbaseExtension = !!(window as any).coinbaseWalletExtension;

      // Also check for ethereum provider from Coinbase Wallet
      const hasProvider = !!(window as any).ethereum?.isCoinbaseWallet;

      const isInstalled = hasCoinbaseExtension || hasProvider;

      console.log('📱 Mobile wallet detection:', {
        hasCoinbaseExtension,
        hasProvider,
        isInstalled
      });

      setHasCoinbaseWallet(isInstalled);

      // If not installed on mobile, show install prompt
      if (!isInstalled) {
        console.warn('⚠️ Coinbase Wallet app not detected on mobile device');
        setShowInstallPrompt(true);
      }
    };

    // Run detection after a brief delay to let SDK initialize
    detectCoinbaseWallet();

    // Enable mobile debugging console with ?debug=true in URL
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('debug') === 'true' || process.env.NODE_ENV === 'development') {
        import('eruda').then((eruda) => {
          eruda.default.init();
          console.log('📱 Mobile debugging console enabled');

          // Ensure eruda is above all other UI
          const erudaContainer = document.querySelector('.eruda-container');
          if (erudaContainer) {
            (erudaContainer as HTMLElement).style.zIndex = '999999999';
          }
        });
      }

      // Clear cached wallet state with ?clear=true
      if (urlParams.get('clear') === 'true') {
        console.log('🧹 Clearing ALL cached state (wallet + session)...');

        // Clear wallet cache
        localStorage.removeItem('wallet_connection_state');
        localStorage.removeItem('wagmi.store');
        localStorage.removeItem('wagmi.cache');
        localStorage.removeItem('wagmi.recentConnectorId');

        // Clear Supabase session
        import('@/utils/supabaseClient').then(({ supabase }) => {
          supabase.auth.signOut().then(() => {
            console.log('✅ Session cleared');
          });
        });

        // Clear all cookies
        document.cookie.split(";").forEach((c) => {
          document.cookie = c
            .replace(/^ +/, "")
            .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
        });

        console.log('✅ All cache cleared. Reloading...');
        alert('All cache cleared! You will now appear as a new user.');
        setTimeout(() => {
          window.location.href = window.location.pathname;
        }, 500);
      }
    }
  }, []);

  // Monitor connection state changes to detect loops AND popup blockers
  useEffect(() => {
    if (isConnecting) {
      connectionAttemptsRef.current += 1;
      console.log(`🔄 Connection attempt #${connectionAttemptsRef.current}`, {
        isConnecting,
        isDisconnected,
        address,
        timestamp: new Date().toISOString(),
      });

      // Show popup warning after 3 seconds of connecting (likely blocked)
      const popupWarningTimer = setTimeout(() => {
        if (isConnecting && !address) {
          console.warn('⚠️ Connection taking longer than expected - possible popup blocker');
          setShowPopupWarning(true);
        }
      }, 3000);

      // Detect infinite loop (more than 5 attempts in this session)
      if (connectionAttemptsRef.current > 5) {
        console.error('❌ Infinite connection loop detected! Stopping...');
        setIsProcessing(false);
        setShowPopupWarning(false);
        alert(
          'Connection loop detected. This may happen if the Coinbase Wallet app is not installed. Please try using a browser with the Coinbase Wallet extension, or install the Coinbase Wallet mobile app.'
        );
      }

      return () => clearTimeout(popupWarningTimer);
    } else {
      // Clear warning when not connecting
      setShowPopupWarning(false);
    }
  }, [isConnecting, isDisconnected, address]);

  // Use persistent wallet connection hook
  const persistentWallet = usePersistentWalletConnection();

  // Check if user needs to complete onboarding (show invite modal)
  useEffect(() => {
    const checkOnboarding = async () => {
      console.log('📋 Onboarding check triggered:', {
        address,
        isVerificationComplete,
        isSmartWallet,
        timestamp: new Date().toISOString(),
      });

      // Wait for address, verification to complete, AND smart wallet confirmation
      if (!address || !isVerificationComplete || !isSmartWallet) {
        console.log('⏭️ Skipping onboarding check - conditions not met:', {
          hasAddress: !!address,
          isVerificationComplete,
          isSmartWallet,
        });
        return;
      }

      console.log('🔍 Checking onboarding status for:', address);

      try {
        // Check if first user
        const firstUser = isFirstUser(address);
        console.log('👤 First user check:', { address, isFirstUser: firstUser });
        setIsFirstUserAccount(firstUser);

        // Check if already onboarded
        const completed = await hasCompletedOnboarding(address);
        console.log('📊 Onboarding status retrieved:', {
          address,
          completed,
          timestamp: new Date().toISOString(),
        });
        setOnboardingComplete(completed);

        // Show invite modal if not completed
        if (!completed) {
          console.log('🔑 User needs onboarding - showing invite modal');
          setShowInviteModal(true);
        } else {
          console.log('✅ User already onboarded');
        }
      } catch (error) {
        console.error('❌ Error checking onboarding status:', error);
        // On error, assume user needs onboarding
        setOnboardingComplete(false);
        setShowInviteModal(true);
      }
    };

    checkOnboarding();
  }, [address, isSmartWallet, isVerificationComplete]);

  // Invite code validation handler
  const handleInviteValidation = async (
    inviteCode: string,
  ): Promise<boolean> => {
    if (!address) return false;

    try {
      // Validate invite code
      console.log('📝 Validating invite code...');
      const validateResponse = await fetch('/api/invite/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode,
          walletAddress: address,
        }),
      });

      const validateResult = await validateResponse.json();

      if (!validateResult.success) {
        console.error('❌ Invite validation failed:', validateResult.error);
        return false;
      }

      console.log('✅ Invite code validated successfully');
      // Modal will now proceed to hat minting step
      return true;
    } catch (error) {
      console.error('Error validating invite code:', error);
      return false;
    }
  };

  // Hat minting completion handler
  const handleHatMinted = async (txHash: string): Promise<void> => {
    console.log('🎩 Hat minted, completing onboarding...', txHash);

    try {
      // Complete onboarding (airdrop + mark as onboarded)
      const completeResponse = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: address,
          isFirstUser: isFirstUserAccount,
          transactionHashes: {
            hat: txHash,
          },
        }),
      });

      const completeResult = await completeResponse.json();

      if (completeResult.success) {
        console.log('✅ Onboarding completed successfully!');
        console.log('   Airdrop:', completeResult.airdrop);
        setOnboardingComplete(true);
      } else {
        console.error('❌ Onboarding completion failed:', completeResult.error);
      }
    } catch (error) {
      console.error('Error completing onboarding:', error);
    }
  };

  // Check if the connected wallet is a Smart Wallet using centralized service
  useEffect(() => {
    let cancelled = false;

    const checkSmartWallet = async () => {
      if (!address || !connector) {
        console.log('⏭️ No address or connector, skipping verification');
        setIsSmartWallet(false);
        setIsVerifyingWallet(false);
        setIsVerificationComplete(true);
        setIsProcessing(false); // Clear processing state when no wallet
        verificationRef.current = { isComplete: true, isSmartWallet: false };
        return;
      }

      console.log('🔍 Starting wallet verification...', {
        address,
        connectorId: connector.id,
        connectorName: connector.name,
      });

      setIsVerifyingWallet(true);
      setIsVerificationComplete(false);
      verificationRef.current = { isComplete: false, isSmartWallet: false };

      try {
        // Use the centralized wallet verification service
        const result = await walletVerificationService.verifyWallet(
          address,
          connector,
        );

        if (!cancelled) {
          console.log('✅ Wallet verification complete:', {
            isSmartWallet: result.isSmartWallet,
            detectedMethod: result.detectedMethod,
          });

          // Update state with verification result
          verificationRef.current = {
            isComplete: true,
            isSmartWallet: result.isSmartWallet,
          };
          setIsSmartWallet(result.isSmartWallet);
          setIsVerifyingWallet(false);
          setIsVerificationComplete(true);
          setIsProcessing(false); // Clear processing state after verification completes
        }
      } catch (error) {
        console.error('❌ Wallet verification failed:', error);

        if (!cancelled) {
          console.log('⚠️ Marking wallet as non-smart due to verification error');
          verificationRef.current = { isComplete: true, isSmartWallet: false };
          setIsSmartWallet(false);
          setIsVerifyingWallet(false);
          setIsVerificationComplete(true);
          setIsProcessing(false); // Clear processing state on error
        }
      }
    };

    checkSmartWallet();

    return () => {
      cancelled = true;
    };
  }, [address, connector]);

  // Reset authentication attempt flag only when address actually changes
  const previousAddressRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    // Only reset if address changed to a different address (not just undefined)
    if (previousAddressRef.current !== address) {
      if (address) {
        // New address connected - reset flag to allow authentication
        authenticationAttemptedRef.current = false;
      }
      previousAddressRef.current = address;
    }
  }, [address]);

  // Disconnect effect
  useEffect(() => {
    console.log('🔌 Disconnect effect triggered:', {
      address,
      verificationComplete: verificationRef.current.isComplete,
      verificationIsSmartWallet: verificationRef.current.isSmartWallet,
      stateIsSmartWallet: isSmartWallet,
      timestamp: new Date().toISOString(),
    });

    if (address && verificationRef.current.isComplete) {
      console.log('✅ Verification complete, checking wallet status:', {
        isSmartWallet: verificationRef.current.isSmartWallet,
        address,
        isVerificationComplete: verificationRef.current.isComplete,
      });

      if (verificationRef.current.isSmartWallet) {
        console.log('✅ Smart Wallet verified, proceeding with connection');
      } else {
        console.log(
          '❌ Non-Smart Wallet detected after complete verification. Disconnecting...',
        );
        disconnect();
      }
    }
  }, [address, isVerificationComplete, disconnect, isSmartWallet]);

  // Use centralized auth system when Smart Wallet is connected AND onboarding is complete
  useEffect(() => {
    const initiateAuthentication = async () => {
      console.log('🔐 Authentication check triggered:', {
        address,
        isSmartWallet,
        isAuthenticated,
        isConnecting,
        isDisconnected,
        authLoading,
        onboardingComplete,
        isFirstUserAccount,
        authenticationAttempted: authenticationAttemptedRef.current,
        timestamp: new Date().toISOString(),
      });

      // Only authenticate after onboarding is complete (or first user)
      if (
        address &&
        isSmartWallet &&
        !isAuthenticated &&
        !isConnecting &&
        !isDisconnected &&
        !authLoading &&
        (onboardingComplete || isFirstUserAccount) &&
        !authenticationAttemptedRef.current // Prevent duplicate attempts
      ) {
        console.log(
          '🔑 Smart Wallet is connected and onboarding complete. Using centralized auth system...',
        );
        authenticationAttemptedRef.current = true; // Mark as attempted
        setIsProcessing(true);
        try {
          await signIn(address);
          console.log('✅ Centralized authentication successful');
        } catch (err) {
          console.error('❌ Failed to authenticate with centralized system:', err);
          authenticationAttemptedRef.current = false; // Reset on failure to allow retry
        } finally {
          setIsProcessing(false);
        }
      } else {
        console.log('⏭️ Skipping authentication - conditions not met');
      }
    };

    initiateAuthentication();
    // NOTE: Deliberately excluding `signIn` from dependencies to prevent re-triggering
    // when auth state changes. The ref guard prevents duplicate calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    address,
    isSmartWallet,
    isAuthenticated,
    isConnecting,
    isDisconnected,
    authLoading,
    onboardingComplete,
    isFirstUserAccount,
  ]);

  // Once the Smart Wallet is connected and authenticated, redirect the user.
  useEffect(() => {
    if (
      address &&
      isSmartWallet &&
      isAuthenticated &&
      !hasRedirected &&
      !authLoading &&
      !isRedirecting
    ) {
      console.log(
        `User authenticated with Smart Wallet: ${address}. Redirecting...`,
      );
      setIsRedirecting(true);
      setHasRedirected(true);
      router.push('/home');
    }
  }, [
    address,
    isSmartWallet,
    isAuthenticated,
    hasRedirected,
    authLoading,
    isRedirecting,
    router,
  ]);

  // State to control if Connect button should be shown
  const [showConnectButton, setShowConnectButton] = useState(false);

  if (!isClient) return null;

  // Show private browsing warning for mobile users
  if (isPrivateBrowsing && !address) {
    return (
      <div>
        <img
          src="/images/doyoudare.png"
          alt="Background"
          className="background-image"
        />
        <div className="wrapper">
          <div className="button-container" style={{ maxWidth: '400px', padding: '20px' }}>
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              padding: '32px 24px',
              borderRadius: '16px',
              textAlign: 'center',
              border: '2px solid #F59E0B',
              boxShadow: '0 8px 24px rgba(245, 158, 11, 0.2)'
            }}>
              {/* Warning Icon */}
              <div style={{ marginBottom: '20px' }}>
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none" style={{ margin: '0 auto' }}>
                  <circle cx="32" cy="32" r="28" fill="#FEF3C7"/>
                  <path d="M32 20v16M32 44h.01" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round"/>
                </svg>
              </div>

              <h2 style={{
                fontSize: '22px',
                fontWeight: '600',
                color: '#92400E',
                marginBottom: '12px',
                letterSpacing: '0.02em'
              }}>
                Private Browsing Detected
              </h2>

              <p style={{
                fontSize: '15px',
                color: '#78350F',
                marginBottom: '20px',
                lineHeight: '1.6'
              }}>
                SpiritDAO requires a <strong>regular browser session</strong> to connect with Coinbase Wallet.
              </p>

              <div style={{
                background: 'rgba(245, 158, 11, 0.1)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px',
                textAlign: 'left'
              }}>
                <p style={{
                  fontSize: '13px',
                  color: '#92400E',
                  marginBottom: '12px',
                  fontWeight: '500'
                }}>
                  Why this matters:
                </p>
                <ul style={{
                  fontSize: '12px',
                  color: '#78350F',
                  lineHeight: '1.8',
                  paddingLeft: '20px',
                  margin: 0
                }}>
                  <li>Private mode blocks deep linking to apps</li>
                  <li>Wallet authentication won't work properly</li>
                  <li>You'll experience connection failures</li>
                </ul>
              </div>

              <div style={{
                background: 'rgba(47, 93, 80, 0.05)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px',
                textAlign: 'left'
              }}>
                <p style={{
                  fontSize: '13px',
                  color: '#2F5D50',
                  marginBottom: '8px',
                  fontWeight: '500'
                }}>
                  How to fix:
                </p>
                <ol style={{
                  fontSize: '12px',
                  color: '#5F5A54',
                  lineHeight: '1.8',
                  paddingLeft: '20px',
                  margin: 0
                }}>
                  <li><strong>Close this private tab</strong></li>
                  <li><strong>Open a regular browser tab</strong></li>
                  <li>Visit: <span style={{ fontFamily: 'monospace', background: '#F3F4F6', padding: '2px 6px', borderRadius: '4px' }}>app.spiritdao.org</span></li>
                  <li>Connect with Coinbase Wallet</li>
                </ol>
              </div>

              <p style={{
                fontSize: '11px',
                color: '#8FAAA1',
                fontStyle: 'italic',
                marginBottom: '16px'
              }}>
                Your privacy matters - we don't track you. Regular browsing is required only for wallet deep-linking.
              </p>

              {/* Bypass Button (for testing/debugging only) */}
              <button
                onClick={() => {
                  console.log('⚠️ User bypassing private browsing check (not recommended)');
                  setIsPrivateBrowsing(false);
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  color: '#9CA3AF',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '12px',
                  fontWeight: '400',
                  cursor: 'pointer'
                }}
              >
                Continue Anyway (Not Recommended)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show install prompt for mobile users without Coinbase Wallet app
  if (showInstallPrompt && hasCoinbaseWallet === false && !address) {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);

    const appStoreUrl = isIOS
      ? 'https://apps.apple.com/app/coinbase-wallet/id1278383455'
      : isAndroid
      ? 'https://play.google.com/store/apps/details?id=org.toshi'
      : 'https://www.coinbase.com/wallet/downloads';

    return (
      <div>
        <img
          src="/images/doyoudare.png"
          alt="Background"
          className="background-image"
        />
        <div className="wrapper">
          <div className="button-container" style={{ maxWidth: '400px', padding: '20px' }}>
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              padding: '32px 24px',
              borderRadius: '16px',
              textAlign: 'center',
              border: '1px solid #D8D2C8',
              boxShadow: '0 8px 24px rgba(47, 93, 80, 0.15)'
            }}>
              {/* App Icon */}
              <div style={{ marginBottom: '20px' }}>
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none" style={{ margin: '0 auto' }}>
                  <rect width="64" height="64" rx="12" fill="#0052FF"/>
                  <path d="M32 16C23.163 16 16 23.163 16 32C16 40.837 23.163 48 32 48C40.837 48 48 40.837 48 32C48 23.163 40.837 16 32 16ZM32 42C26.477 42 22 37.523 22 32C22 26.477 26.477 22 32 22C37.523 22 42 26.477 42 32C42 37.523 37.523 42 32 42Z" fill="white"/>
                </svg>
              </div>

              <h2 style={{
                fontSize: '22px',
                fontWeight: '600',
                color: '#3A3A3A',
                marginBottom: '12px',
                letterSpacing: '0.02em'
              }}>
                Coinbase Wallet Required
              </h2>

              <p style={{
                fontSize: '15px',
                color: '#5F5A54',
                marginBottom: '24px',
                lineHeight: '1.6'
              }}>
                SpiritDAO uses Coinbase Smart Wallet for secure, gas-free access.
                <br />
                <strong>Install the app to continue.</strong>
              </p>

              {/* Install Button */}
              <a
                href={appStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  width: '100%',
                  background: '#0052FF',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '14px 20px',
                  fontSize: '16px',
                  fontWeight: '600',
                  textDecoration: 'none',
                  marginBottom: '12px',
                  cursor: 'pointer'
                }}
              >
                {isIOS ? '📱 Install from App Store' :
                 isAndroid ? '📱 Install from Play Store' :
                 '📱 Download Coinbase Wallet'}
              </a>

              {/* Instructions */}
              <div style={{
                background: 'rgba(47, 93, 80, 0.05)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px'
              }}>
                <p style={{
                  fontSize: '13px',
                  color: '#2F5D50',
                  marginBottom: '8px',
                  fontWeight: '500'
                }}>
                  After installing:
                </p>
                <ol style={{
                  fontSize: '12px',
                  color: '#5F5A54',
                  textAlign: 'left',
                  lineHeight: '1.8',
                  paddingLeft: '20px',
                  margin: 0
                }}>
                  <li>Open the Coinbase Wallet app</li>
                  <li>Complete the setup wizard</li>
                  <li>Return here and tap "I've Installed the App"</li>
                </ol>
              </div>

              {/* Bypass Button */}
              <button
                onClick={() => {
                  console.log('⚠️ User bypassing Coinbase Wallet requirement');
                  setShowInstallPrompt(false);
                  setHasCoinbaseWallet(true); // Allow connection attempt
                }}
                style={{
                  width: '100%',
                  background: 'transparent',
                  color: '#8FAAA1',
                  border: '1px solid #D8D2C8',
                  borderRadius: '12px',
                  padding: '12px 20px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  marginBottom: '8px'
                }}
              >
                I've Installed the App
              </button>

              <p style={{
                fontSize: '11px',
                color: '#8FAAA1',
                marginTop: '16px',
                fontStyle: 'italic'
              }}>
                Desktop users can continue without the app
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show Firefox warning if detected and not already connected
  if (isFirefox && !address) {
    return (
      <div>
        <img
          src="/images/doyoudare.png"
          alt="Background"
          className="background-image"
        />
        <div className="wrapper">
          <div className="button-container" style={{ maxWidth: '400px', padding: '20px' }}>
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              padding: '24px',
              borderRadius: '12px',
              textAlign: 'center',
              color: '#333'
            }}>
              <h2 style={{ marginBottom: '16px', fontSize: '20px', fontWeight: 'bold' }}>
                Browser Not Supported
              </h2>
              <p style={{ marginBottom: '16px', lineHeight: '1.5' }}>
                Firefox is not currently supported for wallet authentication.
                Please use <strong>Chrome</strong> or <strong>Safari</strong> to access SpiritDAO.
              </p>
              <p style={{ fontSize: '14px', color: '#666' }}>
                This limitation is due to Coinbase Wallet SDK compatibility.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state during any processing
  const isLoading =
    isConnecting ||
    isVerifyingWallet ||
    isProcessing ||
    authLoading ||
    isRedirecting ||
    (address && isSmartWallet && !isAuthenticated);

  // Show loading message based on state
  const getLoadingMessage = () => {
    if (isRedirecting) return 'Redirecting...';
    if (isConnecting) return 'Creating your wallet...\nPlease complete authentication in the modal';
    if (isVerifyingWallet) return 'Verifying wallet...';
    if (authLoading) return 'Authenticating...';
    if (address && isSmartWallet && !isAuthenticated) return 'Completing authentication...';
    return 'Loading...';
  };

  // If redirecting, show redirect message
  if (isRedirecting) {
    return (
      <div>
        <img
          src="/images/doyoudare.png"
          alt="Background"
          className="background-image"
        />
        <div className="wrapper">
          <div className="button-container">
            <p className="text-center text-white">Redirecting...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show waiting for approval screen when connecting
  if (isConnecting) {
    return (
      <div>
        <img
          src="/images/doyoudare.png"
          alt="Background"
          className="background-image"
        />
        <div className="wrapper">
          <div className="button-container">
            <div style={{ textAlign: 'center', color: 'white' }}>
              <p style={{ fontSize: '18px', marginBottom: '12px', fontWeight: 'bold' }}>
                Creating your wallet...
              </p>
              <p style={{ fontSize: '14px', marginBottom: '8px' }}>
                Please complete the authentication in the modal
              </p>
              <p style={{ fontSize: '12px', opacity: 0.8, marginBottom: '16px' }}>
                This may take a few moments
              </p>

              {/* Popup Blocker Warning */}
              {showPopupWarning && (
                <div style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  padding: '16px',
                  borderRadius: '12px',
                  marginTop: '16px',
                  maxWidth: '400px',
                  margin: '16px auto 0',
                  border: '2px solid #F59E0B'
                }}>
                  <p style={{
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: '#F59E0B',
                    marginBottom: '8px'
                  }}>
                    ⚠️ Connection Taking Longer Than Expected
                  </p>
                  <p style={{ fontSize: '13px', color: '#3A3A3A', marginBottom: '12px', lineHeight: '1.4' }}>
                    If a popup was blocked:
                  </p>
                  <ul style={{
                    fontSize: '12px',
                    color: '#5F5A54',
                    textAlign: 'left',
                    lineHeight: '1.6',
                    paddingLeft: '20px'
                  }}>
                    <li>Look for a popup blocker icon in your browser's address bar</li>
                    <li>Allow popups for this site</li>
                    <li>Or install the Coinbase Wallet mobile app for seamless authentication</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main display - OnchainKit Connect Wallet button
  return (
    <div>
      <img
        src="/images/doyoudare.png"
        alt="Background"
        className="background-image"
      />
      <div className="wrapper">
        <div className="button-container">
          <WalletProvider>
            <ConnectWallet
              className="button enter-button"
              text={isLoading ? 'Loading...' : 'Enter'}
            />
          </WalletProvider>
        </div>
      </div>

      {/* Invite Code Modal - Shows for new users after wallet connection */}
      {address && showInviteModal && (
        <InviteCodeModal
          isOpen={showInviteModal}
          onClose={() => {
            // Cannot close without validating (except first user)
            if (isFirstUserAccount) {
              setShowInviteModal(false);
              setOnboardingComplete(true);
            }
          }}
          onValidate={handleInviteValidation}
          onHatMinted={handleHatMinted}
          walletAddress={address}
          isFirstUser={isFirstUserAccount}
        />
      )}
    </div>
  );
}
