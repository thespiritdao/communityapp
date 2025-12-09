// src/app/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
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
  const { connect, connectors } = useConnect();
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

    // Enable mobile debugging console with ?debug=true in URL
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('debug') === 'true' || process.env.NODE_ENV === 'development') {
        import('eruda').then((eruda) => {
          eruda.default.init();
          console.log('📱 Mobile debugging console enabled');
        });
      }
    }
  }, []);

  // Monitor connection state changes to detect loops
  useEffect(() => {
    if (isConnecting) {
      connectionAttemptsRef.current += 1;
      console.log(`🔄 Connection attempt #${connectionAttemptsRef.current}`, {
        isConnecting,
        isDisconnected,
        address,
        timestamp: new Date().toISOString(),
      });

      // Detect infinite loop (more than 5 attempts in this session)
      if (connectionAttemptsRef.current > 5) {
        console.error('❌ Infinite connection loop detected! Stopping...');
        setIsProcessing(false);
        alert(
          'Connection loop detected. This may happen if the Coinbase Wallet app is not installed. Please try using a browser with the Coinbase Wallet extension, or install the Coinbase Wallet mobile app.'
        );
      }
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

  // Function to connect Smart Wallet only
  const connectSmartWallet = async () => {
    // Find the Coinbase Wallet connector
    const coinbaseConnector = connectors.find(
      (connector) =>
        connector.name === 'Coinbase Wallet' ||
        connector.id === 'coinbaseWallet' ||
        connector.id === 'coinbaseWalletSDK',
    );

    if (coinbaseConnector) {
      console.log('🔌 Connecting with Coinbase Smart Wallet:', {
        name: coinbaseConnector.name,
        id: coinbaseConnector.id,
        userAgent: navigator.userAgent,
        hasCoinbaseApp: navigator.userAgent.includes('CoinbaseWallet'),
        timestamp: new Date().toISOString(),
      });
      setIsProcessing(true);

      try {
        const result = await connect({ connector: coinbaseConnector });
        console.log('✅ Wallet connection initiated successfully:', result);
      } catch (error: any) {
        console.error('❌ Wallet connection error:', {
          message: error?.message,
          code: error?.code,
          name: error?.name,
          details: error,
          timestamp: new Date().toISOString(),
        });
        setIsProcessing(false);

        // Show user-friendly error
        alert(
          'Failed to connect wallet. Please ensure you have a stable internet connection and try again.'
        );
      }
    } else {
      console.error(
        'Coinbase Wallet connector not found. Available connectors:',
        connectors.map((c) => ({ name: c.name, id: c.id })),
      );
    }
  };

  // Function to handle Enter button click
  const handleEnter = () => {
    if (!address) {
      // New user - trigger wallet connection
      connectSmartWallet();
    } else if (address && isSmartWallet && !isAuthenticated) {
      // Existing wallet connected but not authenticated - this will be handled by useEffect
      setIsProcessing(true);
    }
  };

  if (!isClient) return null;

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

  // Main display - single Enter button for all states
  return (
    <div>
      <img
        src="/images/doyoudare.png"
        alt="Background"
        className="background-image"
      />
      <div className="wrapper">
        <div className="button-container">
          <button
            onClick={handleEnter}
            className="button enter-button"
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Enter'}
          </button>
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
