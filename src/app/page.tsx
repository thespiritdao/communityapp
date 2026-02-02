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

  // Debug CDP initialization
  useEffect(() => {
    console.log('🔍 CDP Status:', {
      cdpInitialized,
      currentUser: !!currentUser,
      walletAddress,
    });
  }, [cdpInitialized, currentUser, walletAddress]);

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

  // Ref to prevent multiple onboarding checks
  const onboardingCheckRunRef = useRef(false);

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
        // Use async IIFE to properly await all cleanup before reload
        (async () => {
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

          // Clear Supabase session (await completion)
          const { supabase } = await import('@/utils/supabaseClient');
          await supabase.auth.signOut();
          console.log('✅ Supabase session cleared');

          // Clear all cookies
          document.cookie.split(';').forEach((c) => {
            document.cookie = c
              .replace(/^ +/, '')
              .replace(/=.*/, '=;expires=' + new Date(0).toUTCString() + ';path=/');
          });

          // Clear IndexedDB (CDP auth data) - AWAIT completion before reload
          if (window.indexedDB && 'databases' in indexedDB) {
            const dbs = await indexedDB.databases();
            await Promise.all(
              dbs
                .filter(
                  (db) =>
                    db.name &&
                    (db.name.includes('coinbase') || db.name.includes('cdp')),
                )
                .map(
                  (db) =>
                    new Promise<void>((resolve) => {
                      console.log('🧹 Deleting IndexedDB:', db.name);
                      const request = indexedDB.deleteDatabase(db.name!);
                      request.onsuccess = () => resolve();
                      request.onerror = () => resolve(); // best effort
                      request.onblocked = () => resolve();
                    }),
                ),
            );
          }

          console.log('✅ All cache cleared. Reloading...');
          alert('All cache cleared! You will now appear as a new user.');
          // Reload after ALL cleanup is complete (no timeout needed)
          window.location.href = window.location.pathname;
        })();
      }
    }
  }, []);

  // STEP 1: Show pre-auth invite modal (BEFORE wallet creation)
  useEffect(() => {
    if (!isClient) return;

    console.log('👀 Invite modal check:', {
      walletAddress,
      validatedInviteCode,
      showPreAuthInvite,
    });

    // If user doesn't have a wallet yet and hasn't validated invite code
    // Show modal immediately without waiting for CDP initialization
    if (!walletAddress && !validatedInviteCode && !showPreAuthInvite) {
      console.log('🔑 No wallet detected - showing pre-auth invite modal');
      setShowPreAuthInvite(true);
    }
  }, [isClient, walletAddress, validatedInviteCode, showPreAuthInvite]);

  // FAILSAFE: Force show invite modal after 2 seconds if nothing is happening
  useEffect(() => {
    if (!isClient) return;

    const failsafeTimer = setTimeout(() => {
      if (!walletAddress && !validatedInviteCode && !showPreAuthInvite) {
        console.warn('⚠️ FAILSAFE: Forcing invite modal to show after 2s delay');
        setShowPreAuthInvite(true);
      }
    }, 2000);

    return () => clearTimeout(failsafeTimer);
  }, [isClient, walletAddress, validatedInviteCode, showPreAuthInvite]);

  // STEP 2: After wallet created, check onboarding status
  useEffect(() => {
    const checkWalletOnboarding = async () => {
      if (!walletAddress || onboardingCheckRunRef.current) return;
      onboardingCheckRunRef.current = true; // Mark as running to prevent re-runs

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

        // CRITICAL FIX: Check if user already has a profile (returning user)
        // Must check BEFORE the completed check to get full profile data
        const { supabase } = await import('@/utils/supabaseClient');
        const { data: existingProfile } = await supabase
          .from('user_profiles')
          .select('wallet_address, referral_key, onboarded_at')
          .eq('wallet_address', walletAddress.toLowerCase())
          .maybeSingle();

        if (completed) {
          console.log('✅ User already onboarded - proceeding to authentication');
          // RETURNING USER FIX: Don't show onboarding modal, just authenticate
          // They already have everything set up, just need to log back in
          setOnboardingComplete(true);
          return;
        }

        if (existingProfile && existingProfile.referral_key) {
          console.log('✅ Returning user with existing profile - skipping invite validation');
          console.log('   Profile has referral_key:', existingProfile.referral_key);
          console.log('   Onboarded at:', existingProfile.onboarded_at);

          // Check if they completed onboarding but flag wasn't set properly
          if (existingProfile.onboarded_at) {
            console.log('✅ User has onboarded_at timestamp - treating as fully onboarded');
            setOnboardingComplete(true);
            return;
          }

          // User has a profile and referral key but incomplete onboarding
          // Skip invite validation and go straight to completing onboarding
          setShowOnboardingModal(true);
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
          try {
            const isValid = await handlePostAuthInviteValidation(validatedInviteCode);
            if (!isValid) {
              console.error('❌ Invite validation failed after wallet creation');
              alert('Invite code validation failed. Please contact support with error code: INVITE_POST_AUTH_FAIL');
              return;
            }
            console.log('✅ Invite code validated successfully post-auth');
          } catch (validationError) {
            console.error('❌ Exception during post-auth invite validation:', validationError);
            alert(`Error validating invite code: ${validationError instanceof Error ? validationError.message : 'Unknown error'}. Please contact support.`);
            return;
          }
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

    // TEMPORARY: Skip invite validation in development
    if (process.env.NODE_ENV === 'development') {
      console.log('⚠️ Skipping invite validation in development mode');
      return true;
    }

    try {
      console.log('📝 Validating invite code with wallet...');
      console.log('   Invite code:', inviteCode);
      console.log('   Wallet:', walletAddress);

      const validateResponse = await fetch('/api/invite/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteCode,
          walletAddress,
        }),
      });

      console.log('📋 Validation API response status:', validateResponse.status);

      const validateResult = await validateResponse.json();
      console.log('📋 Validation API result:', validateResult);

      if (!validateResult.success) {
        console.error('❌ Invite validation failed:', validateResult.error);
        console.error('   Full result:', JSON.stringify(validateResult, null, 2));
        return false;
      }

      console.log('✅ Invite code validated successfully');
      if (validateResult.isReturningUser) {
        console.log('   (Returning user - allowed to proceed)');
      }
      return true;
    } catch (error) {
      console.error('❌ Exception validating invite code:', error);
      console.error('   Error details:', error instanceof Error ? error.message : String(error));
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
          // Get email from capturedEmail state OR from CDP currentUser as fallback
          const emailToUse = capturedEmail || (currentUser as any)?.email || undefined;

          console.log('📧 Email sources:', {
            capturedEmail,
            cdpUserEmail: (currentUser as any)?.email,
            emailToUse,
          });

          await signIn(walletAddress, emailToUse);
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
    // Note: currentUser is intentionally NOT in deps to prevent flickering
    // We read it inside the effect when needed, not as a dependency
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

  // Main display - Always show background and appropriate UI
  // Don't wait for CDP initialization to show invite modal
  return (
    <div>
      <img
        src="/images/doyoudare.png"
        alt="Background"
        className="background-image"
      />
      <div className="wrapper">
        <div className="button-container">
          {/* Show wallet auth only if:
              1. CDP is initialized
              2. Invite code validated OR wallet already exists
              3. Not showing onboarding modal */}
          {isClient && cdpInitialized && (validatedInviteCode || walletAddress) && !showOnboardingModal && (
            <>
              <EmbeddedWalletAuth
                isLoading={isLoading}
                onEmailCaptured={setCapturedEmail}
              />
              {isLoading && (
                <p className="text-center text-white mt-4">
                  {authLoading ? 'Authenticating...' : 'Processing...'}
                </p>
              )}
            </>
          )}

          {/* Show loading while CDP initializes (only if we have validated invite code) */}
          {isClient && !cdpInitialized && validatedInviteCode && (
            <div className="text-center">
              <p className="text-white">Initializing wallet system...</p>
              <p className="text-white text-sm mt-2 opacity-75">This may take a few moments</p>
            </div>
          )}

          {/* Show preparing message if mounted but no invite code yet */}
          {isClient && !validatedInviteCode && !showPreAuthInvite && (
            <p className="text-center text-white">Preparing...</p>
          )}
        </div>
      </div>

      {/* PRE-AUTH: Invite Code Modal (BEFORE wallet creation) */}
      {/* Show immediately when mounted, no need to wait for CDP */}
      {isClient && showPreAuthInvite && !walletAddress && (
        <InviteCodeModal
          isOpen={showPreAuthInvite}
          onClose={() => {
            console.log('📋 Closing pre-auth invite modal');
            setShowPreAuthInvite(false);
          }}
          onValidate={handlePreAuthInviteCheck}
          preAuthMode={true}
          isFirstUser={true} // Allow first user bypass in pre-auth mode
        />
      )}

      {/* POST-AUTH: Onboarding Modal (AFTER wallet creation - just for hat minting) */}
      {isClient && cdpInitialized && walletAddress && showOnboardingModal && (
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
