// src/app/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import '@/styles/transactionStyles.css';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/features/identity';
import { InviteCodeModal } from '@/components/InviteCodeModal';
import {
  isFirstUser,
  hasCompletedOnboarding,
} from '@/services/inviteCodeService';
import { useIsInitialized, useCurrentUser, useEvmAddress } from '@coinbase/cdp-hooks';
import { EmbeddedWalletAuth } from '@/wallet/components/EmbeddedWalletAuth';

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
  // Core Hooks
  const router = useRouter();
  const { isInitialized: cdpInitialized } = useIsInitialized();
  const { currentUser } = useCurrentUser();
  const { evmAddress: walletAddress } = useEvmAddress(); // Get EVM wallet address

  // Use centralized auth system
  const { isAuthenticated, signIn, loading: authLoading } = useAuthContext();

  // Local state
  const [hasRedirected, setHasRedirected] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const authenticationAttemptedRef = useRef(false);
  const [isClient, setIsClient] = useState(false);

  // Pre-auth invite code state
  const [showPreAuthInvite, setShowPreAuthInvite] = useState(false);
  const [validatedInviteCode, setValidatedInviteCode] = useState<string | null>(null);

  // Post-auth onboarding state
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [isFirstUserAccount, setIsFirstUserAccount] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  // Email capture for database storage
  const [capturedEmail, setCapturedEmail] = useState<string | undefined>(undefined);

  // Client-side mounting
  useEffect(() => {
    setIsClient(true);

    // Restore validated invite code from sessionStorage
    if (typeof window !== 'undefined') {
      const savedInviteCode = sessionStorage.getItem('validated_invite_code');
      if (savedInviteCode) {
        console.log('🔑 Restored validated invite code from session');
        setValidatedInviteCode(savedInviteCode);
      }

      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('debug') === 'true' || process.env.NODE_ENV === 'development') {
        import('eruda').then((eruda) => {
          eruda.default.init();
          console.log('📱 Mobile debugging console enabled');

          const erudaContainer = document.querySelector('.eruda-container');
          if (erudaContainer) {
            (erudaContainer as HTMLElement).style.zIndex = '999999999';
          }
        });
      }

      // Clear cached state with ?clear=true
      if (urlParams.get('clear') === 'true') {
        console.log('🧹 Clearing ALL cached state...');

        // Clear wallet cache
        localStorage.removeItem('wallet_connection_state');
        localStorage.removeItem('wagmi.store');
        localStorage.removeItem('wagmi.cache');
        localStorage.removeItem('wagmi.recentConnectorId');

        // Clear CDP/Coinbase auth storage (fixes 400 Bad Request errors)
        Object.keys(localStorage).forEach((key) => {
          if (
            key.startsWith('cdp_') ||
            key.startsWith('coinbase_') ||
            key.startsWith('cbw_') ||
            key.includes('embedded_wallet')
          ) {
            console.log('🧹 Removing CDP storage key:', key);
            localStorage.removeItem(key);
          }
        });

        // Clear sessionStorage
        sessionStorage.clear();

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

        // Clear IndexedDB (CDP auth data)
        if (window.indexedDB) {
          indexedDB.databases().then((dbs) => {
            dbs.forEach((db) => {
              if (db.name && (db.name.includes('coinbase') || db.name.includes('cdp'))) {
                console.log('🧹 Deleting IndexedDB:', db.name);
                indexedDB.deleteDatabase(db.name);
              }
            });
          });
        }

        console.log('✅ All cache cleared. Reloading...');
        alert('All cache cleared! You will now appear as a new user.');
        setTimeout(() => {
          window.location.href = window.location.pathname;
        }, 500);
      }
    }
  }, []);

  // STEP 1: Show pre-auth invite modal (BEFORE wallet creation)
  useEffect(() => {
    if (!isClient) return;

    // If user doesn't have a wallet yet and hasn't validated invite code
    // Show modal immediately without waiting for CDP initialization
    if (!walletAddress && !validatedInviteCode) {
      console.log('🔑 No wallet detected - showing pre-auth invite modal');
      setShowPreAuthInvite(true);
    }
  }, [isClient, walletAddress, validatedInviteCode]);

  // STEP 2: After wallet created, check onboarding status
  useEffect(() => {
    const checkWalletOnboarding = async () => {
      if (!walletAddress) return;

      console.log('📋 Wallet created - checking onboarding status:', {
        walletAddress,
        hasInviteCode: !!validatedInviteCode,
        inviteCode: validatedInviteCode
      });

      try {
        // Check if first user
        const firstUser = isFirstUser(walletAddress);
        setIsFirstUserAccount(firstUser);
        console.log(`👤 First user check: ${firstUser}`);

        // Check if already onboarded
        const completed = await hasCompletedOnboarding(walletAddress);

        if (completed) {
          console.log('✅ User already onboarded - skipping invite flow');
          setOnboardingComplete(true);
          return;
        }

        console.log('🔑 New user detected - needs onboarding');

        // NEW USERS need invite validation
        if (!validatedInviteCode && !firstUser) {
          console.log('⚠️ Missing invite code for new user - showing pre-auth modal');
          setShowPreAuthInvite(true);
          return;
        }

        // Validate invite code for non-first users
        if (!firstUser && validatedInviteCode && validatedInviteCode !== 'FIRST_USER') {
          console.log('🔍 Validating invite code post-auth:', validatedInviteCode);
          const isValid = await handlePostAuthInviteValidation(validatedInviteCode);
          if (!isValid) {
            console.error('❌ Invite validation failed after wallet creation');
            alert('Invite code validation failed. Please contact support.');
            return;
          }
          console.log('✅ Invite code validated successfully post-auth');
        }

        // First user or validated user can proceed to hat minting
        console.log('🎩 Proceeding to hat minting modal');
        setShowOnboardingModal(true);
      } catch (error) {
        console.error('❌ Error checking wallet onboarding:', error);
        alert(`Error during onboarding: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    checkWalletOnboarding();
  }, [walletAddress, validatedInviteCode]);

  // PRE-AUTH: Check if invite code exists (before wallet creation)
  const handlePreAuthInviteCheck = async (
    inviteCode: string,
  ): Promise<boolean> => {
    try {
      console.log('📝 Checking invite code (pre-auth)...');
      const checkResponse = await fetch('/api/invite/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode }),
      });

      const checkResult = await checkResponse.json();

      if (!checkResult.success) {
        console.error('❌ Invite code check failed:', checkResult.error);
        return false;
      }

      console.log('✅ Invite code exists - storing for later');
      setValidatedInviteCode(inviteCode);

      // Persist to sessionStorage so it survives page reloads
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('validated_invite_code', inviteCode);
      }

      return true;
    } catch (error) {
      console.error('Error checking invite code:', error);
      return false;
    }
  };

  // POST-AUTH: Full validation with wallet address (after wallet creation)
  const handlePostAuthInviteValidation = async (
    inviteCode: string,
  ): Promise<boolean> => {
    if (!walletAddress) return false;

    try {
      console.log('📝 Validating invite code with wallet...');
      const validateResponse = await fetch('/api/invite/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode,
          walletAddress,
        }),
      });

      const validateResult = await validateResponse.json();

      if (!validateResult.success) {
        console.error('❌ Invite validation failed:', validateResult.error);
        return false;
      }

      console.log('✅ Invite code validated successfully');
      return true;
    } catch (error) {
      console.error('Error validating invite code:', error);
      return false;
    }
  };

  // Hat minting completion handler
  const handleHatMinted = async (txHash: string): Promise<void> => {
    console.log('🎩 Hat minted successfully! Transaction:', txHash);
    console.log('📝 Completing onboarding for wallet:', walletAddress);

    try {
      const completeResponse = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          isFirstUser: isFirstUserAccount,
          transactionHashes: {
            hat: txHash,
          },
        }),
      });

      const completeResult = await completeResponse.json();
      console.log('📋 Onboarding completion response:', completeResult);

      if (completeResult.success) {
        console.log('✅ Onboarding completed successfully! Setting flag...');
        setOnboardingComplete(true);
        console.log('🎉 User should now authenticate and redirect to /home');
      } else {
        console.error('❌ Onboarding completion failed:', completeResult.error);
        alert(`Onboarding completion failed: ${completeResult.error}`);
      }
    } catch (error) {
      console.error('❌ Error completing onboarding:', error);
      alert(`Error completing onboarding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Reset authentication attempt flag when address changes
  const previousAddressRef = useRef<`0x${string}` | null | undefined>(undefined);
  useEffect(() => {
    if (previousAddressRef.current !== walletAddress) {
      if (walletAddress) {
        authenticationAttemptedRef.current = false;
      }
      previousAddressRef.current = walletAddress;
    }
  }, [walletAddress]);

  // Authenticate when embedded wallet is created and onboarding is complete
  useEffect(() => {
    const initiateAuthentication = async () => {
      console.log('🔐 Authentication check:', {
        walletAddress,
        isAuthenticated,
        onboardingComplete,
        isFirstUserAccount,
      });

      if (
        walletAddress &&
        !isAuthenticated &&
        !authLoading &&
        (onboardingComplete || isFirstUserAccount) &&
        !authenticationAttemptedRef.current
      ) {
        console.log('🔑 Authenticating with Embedded Wallet...');
        authenticationAttemptedRef.current = true;
        setIsProcessing(true);
        try {
          // Use captured email from authentication flow
          if (capturedEmail) {
            console.log('📧 Using captured email:', capturedEmail);
          }

          await signIn(walletAddress, capturedEmail);
          console.log('✅ Authentication successful');
        } catch (err) {
          console.error('❌ Authentication failed:', err);
          authenticationAttemptedRef.current = false;
        } finally {
          setIsProcessing(false);
        }
      }
    };

    initiateAuthentication();
  }, [
    walletAddress,
    isAuthenticated,
    authLoading,
    onboardingComplete,
    isFirstUserAccount,
    capturedEmail,
    signIn,
  ]);

  // Redirect to home when authenticated
  useEffect(() => {
    if (
      walletAddress &&
      isAuthenticated &&
      !hasRedirected &&
      !authLoading &&
      !isRedirecting
    ) {
      console.log('✅ Authenticated. Redirecting to /home...');
      setIsRedirecting(true);
      setHasRedirected(true);
      router.push('/home');
    }
  }, [
    walletAddress,
    isAuthenticated,
    hasRedirected,
    authLoading,
    isRedirecting,
    router,
  ]);

  if (!isClient || !cdpInitialized) {
    return (
      <div>
        <img
          src="/images/doyoudare.png"
          alt="Background"
          className="background-image"
        />
        <div className="wrapper">
          <div className="button-container">
            <p className="text-center text-white">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state during processing
  const isLoading = isProcessing || authLoading || isRedirecting;

  // Show redirecting message
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

  // Main display - Embedded Wallet Authentication
  return (
    <div>
      <img
        src="/images/doyoudare.png"
        alt="Background"
        className="background-image"
      />
      <div className="wrapper">
        <div className="button-container">
          {/* Only show wallet auth if invite code validated OR wallet already exists */}
          {/* HIDE if onboarding modal is showing - user needs to complete hat minting first */}
          {(validatedInviteCode || walletAddress) && !showOnboardingModal && (
            <EmbeddedWalletAuth
              isLoading={isLoading}
              onEmailCaptured={setCapturedEmail}
            />
          )}

          {/* Show waiting message if no wallet and no validated invite yet */}
          {!walletAddress && !validatedInviteCode && !showPreAuthInvite && (
            <p className="text-center text-white">Preparing...</p>
          )}
        </div>
      </div>

      {/* PRE-AUTH: Invite Code Modal (BEFORE wallet creation) */}
      {showPreAuthInvite && !walletAddress && (
        <InviteCodeModal
          isOpen={showPreAuthInvite}
          onClose={() => {
            // Don't override validated invite code - it's already set by handlePreAuthInviteCheck
            // Just close the modal and let user proceed to wallet creation
            console.log('📋 Closing pre-auth invite modal');
            setShowPreAuthInvite(false);
          }}
          onValidate={handlePreAuthInviteCheck}
          preAuthMode={true}
          isFirstUser={true} // Allow first user bypass in pre-auth mode
        />
      )}

      {/* POST-AUTH: Onboarding Modal (AFTER wallet creation - just for hat minting) */}
      {walletAddress && showOnboardingModal && (
        <InviteCodeModal
          isOpen={showOnboardingModal}
          onClose={() => {
            if (isFirstUserAccount) {
              setShowOnboardingModal(false);
              setOnboardingComplete(true);
            }
          }}
          onValidate={async () => true} // Already validated in useEffect
          onHatMinted={handleHatMinted}
          walletAddress={walletAddress}
          isFirstUser={isFirstUserAccount}
          preAuthMode={false}
        />
      )}
    </div>
  );
}
