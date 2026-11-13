// src/components/auth/EmbeddedWalletAuth.tsx
'use client';

import { useState } from 'react';
import { useSignInWithEmail, useVerifyEmailOTP, useSignInWithOAuth, useEvmAddress, useSignOut } from '@coinbase/cdp-hooks';

// Sign-in requests go straight from the browser to api.cdp.coinbase.com. When a
// tracker blocker, strict browser privacy mode, VPN or DNS filter stops them,
// the request never completes and the SDK surfaces a bare network error
// (axios "Network Error", or the browser's own fetch failure text).
const BLOCKED_NETWORK_MESSAGE =
  "Your browser or network is blocking Coinbase sign-in, which SpiritDAO uses to create your account. " +
  "Try turning off tracker blocking or privacy protection for this site (e.g. the shield icon in Firefox or Brave), " +
  "pausing ad-blocker extensions, or using a different browser.";

function isBlockedNetworkError(err: any): boolean {
  const message = `${err?.message ?? ''} ${err?.code ?? ''}`;
  return /Network Error|NetworkError|Failed to fetch|Load failed|ERR_NETWORK|ERR_BLOCKED/i.test(message);
}

interface EmbeddedWalletAuthProps {
  isLoading?: boolean;
  onEmailCaptured?: (email: string) => void;
  onAuthReady?: (walletAddress: string, email: string) => void;
}

export function EmbeddedWalletAuth({ isLoading, onEmailCaptured, onAuthReady }: EmbeddedWalletAuthProps) {
  const { evmAddress } = useEvmAddress();
  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();
  const { signInWithOAuth } = useSignInWithOAuth();
  const { signOut: cdpSignOut } = useSignOut();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [flowId, setFlowId] = useState<string | null>(null);
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      console.log('📧 Sending OTP to email:', email);
      const result = await signInWithEmail({ email });

      if (result.flowId) {
        console.log('✅ OTP sent, flowId:', result.flowId);
        setFlowId(result.flowId);
        setStep('otp');
      } else {
        throw new Error('No flowId returned');
      }
    } catch (err: any) {
      console.error('❌ Email sign-in failed:', err);
      if (err?.message?.includes('already authenticated')) {
        console.log('🔄 Stale CDP session — signing out and retrying...');
        try {
          await cdpSignOut();
          const result = await signInWithEmail({ email });
          if (result.flowId) {
            setFlowId(result.flowId);
            setStep('otp');
          }
          setIsSubmitting(false);
          return;
        } catch (retryErr: any) {
          setError('Session recovery failed. Please clear your browser cache and try again.');
          setIsSubmitting(false);
          return;
        }
      }
      if (isBlockedNetworkError(err)) {
        setError(BLOCKED_NETWORK_MESSAGE);
        return;
      }
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      console.log('🔐 Verifying OTP...');
      const result = await verifyEmailOTP({
        flowId: flowId!,
        otp,
      });

      console.log('✅ OTP verified successfully!', {
        user: result.user,
        isNewUser: result.isNewUser,
      });

      // Capture email for database storage
      if (onEmailCaptured && email) {
        onEmailCaptured(email);
      }

      // Fire onAuthReady immediately with wallet address + email so page.tsx
      // can kick off auth without waiting for the multi-step effect chain.
      // evmAddress may not be available yet (wallet creation async), so we
      // wait briefly for it — page.tsx will also catch it via the effect chain.
      if (onAuthReady && evmAddress && email) {
        console.log('🚀 EmbeddedWalletAuth: firing onAuthReady immediately');
        onAuthReady(evmAddress, email);
      }
      // If evmAddress isn't ready yet, page.tsx's useEffect watching walletAddress
      // will pick it up once the CDP SDK resolves the address.
    } catch (err: any) {
      console.error('❌ OTP verification failed:', err);

      // Check if flow expired
      const errorMessage = err.message || '';
      if (errorMessage.includes('Flow not found') || errorMessage.includes('expired')) {
        setError('Your verification code has expired. Please request a new one.');
        // Auto-reset to email step after brief delay
        setTimeout(() => {
          setStep('email');
          setOtp('');
          setFlowId(null);
          setError('');
        }, 3000);
      } else if (isBlockedNetworkError(err)) {
        setError(BLOCKED_NETWORK_MESSAGE);
      } else {
        setError(errorMessage || 'Invalid OTP. Please try again.');
      }
      setIsSubmitting(false);
    }
  };

  const handleResendOTP = async () => {
    setError('');
    setIsSubmitting(true);

    try {
      console.log('📧 Resending OTP to email:', email);
      const result = await signInWithEmail({ email });

      if (result.flowId) {
        console.log('✅ New OTP sent, flowId:', result.flowId);
        setFlowId(result.flowId);
        setOtp(''); // Clear old OTP
        setError('');
      } else {
        throw new Error('No flowId returned');
      }
    } catch (err: any) {
      console.error('❌ Failed to resend OTP:', err);
      setError(isBlockedNetworkError(err)
        ? BLOCKED_NETWORK_MESSAGE
        : err.message || 'Failed to resend OTP. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsSubmitting(true);

    try {
      // Flag that OAuth is starting — survives the mobile redirect so the
      // post-redirect page load can suppress the invite modal
      if (typeof window !== 'undefined') {
        localStorage.setItem('oauth_in_progress', 'true');
        localStorage.setItem('oauth_in_progress_at', String(Date.now()));
      }
      console.log('🔐 Signing in with Google...');
      const result = await signInWithOAuth('google');
      console.log('✅ Google sign-in successful!', result);
    } catch (err: any) {
      console.error('❌ Google sign-in failed:', err);

      // CDP throws "User is already authenticated" when a stale CDP session
      // persists after a deploy wipes the Supabase session. Sign out of CDP
      // first, then retry automatically.
      if (err?.message?.includes('already authenticated')) {
        console.log('🔄 Stale CDP session detected — signing out and retrying...');
        try {
          // Set flag before sign-out so the post-redirect page load knows
          // OAuth is in progress and suppresses the invite modal
          if (typeof window !== 'undefined') {
            localStorage.setItem('oauth_in_progress', 'true');
            localStorage.setItem('oauth_in_progress_at', String(Date.now()));
          }
          await cdpSignOut();
          console.log('✅ CDP sign-out complete, retrying Google sign-in...');
          await signInWithOAuth('google');
          console.log('✅ Google sign-in successful after recovery!');
          setIsSubmitting(false);
          return;
        } catch (retryErr: any) {
          console.error('❌ Retry after sign-out also failed:', retryErr);
          setError('Session recovery failed. Please clear your browser cache and try again.');
          setIsSubmitting(false);
          return;
        }
      }

      if (isBlockedNetworkError(err)) {
        setError(BLOCKED_NETWORK_MESSAGE);
        setIsSubmitting(false);
        return;
      }

      const errorMessage = err.message || err.toString() || 'Failed to sign in with Google';
      setError(`Google sign-in error: ${errorMessage}. Please try again or use email instead.`);
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <button className="button enter-button" disabled>
        Loading...
      </button>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: '400px' }}>
      {step === 'email' ? (
        // Email Input Step
        <form onSubmit={handleEmailSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '16px',
                borderRadius: '8px',
                border: '1px solid #D8D2C8',
                backgroundColor: 'white',
                marginBottom: '12px',
              }}
            />

            <button
              type="submit"
              disabled={isSubmitting || !email}
              className="button enter-button"
              style={{ width: '100%' }}
            >
              {isSubmitting ? 'Sending...' : 'Continue with Email'}
            </button>
          </div>

          {/* Divider */}
          <div style={{
            position: 'relative',
            textAlign: 'center',
            margin: '20px 0',
          }}>
            <div style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: '1px',
              backgroundColor: '#D8D2C8',
            }} />
            <span style={{
              position: 'relative',
              backgroundColor: 'white',
              padding: '0 12px',
              color: '#8FAAA1',
              fontSize: '14px',
            }}>
              or
            </span>
          </div>

          {/* Google Sign In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: '16px',
              borderRadius: '8px',
              border: '1px solid #D8D2C8',
              backgroundColor: 'white',
              color: '#3A3A3A',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20">
              <path fill="#4285F4" d="M19.6 10.23c0-.82-.1-1.42-.25-2.05H10v3.72h5.5c-.15.96-.74 2.31-2.04 3.22v2.45h3.16c1.89-1.73 2.98-4.3 2.98-7.34z"/>
              <path fill="#34A853" d="M13.46 15.13c-.83.59-1.96 1-3.46 1-2.64 0-4.88-1.74-5.68-4.15H1.07v2.52C2.72 17.75 6.09 20 10 20c2.7 0 4.96-.89 6.62-2.42l-3.16-2.45z"/>
              <path fill="#FBBC05" d="M3.99 10c0-.69.12-1.35.32-1.97V5.51H1.07A9.973 9.973 0 000 10c0 1.61.39 3.14 1.07 4.49l3.24-2.52c-.2-.62-.32-1.28-.32-1.97z"/>
              <path fill="#EA4335" d="M10 3.88c1.88 0 3.13.81 3.85 1.48l2.84-2.76C14.96.99 12.7 0 10 0 6.09 0 2.72 2.25 1.07 5.51l3.24 2.52C5.12 5.62 7.36 3.88 10 3.88z"/>
            </svg>
            Continue with Google
          </button>

          {error && (
            <p style={{
              color: '#8B3A3A',
              fontSize: '14px',
              marginTop: '12px',
              textAlign: 'center',
            }}>
              {error}
            </p>
          )}
        </form>
      ) : (
        // OTP Verification Step
        <form onSubmit={handleOTPSubmit}>
          <div>
            <p style={{
              color: 'white',
              fontSize: '14px',
              marginBottom: '12px',
              textAlign: 'center',
            }}>
              Enter the code sent to {email}
            </p>

            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Enter 6-digit code"
              required
              disabled={isSubmitting}
              maxLength={6}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '20px',
                borderRadius: '8px',
                border: '1px solid #D8D2C8',
                backgroundColor: 'white',
                marginBottom: '12px',
                textAlign: 'center',
                letterSpacing: '8px',
              }}
            />

            <button
              type="submit"
              disabled={isSubmitting || otp.length !== 6}
              className="button enter-button"
              style={{ width: '100%', marginBottom: '8px' }}
            >
              {isSubmitting ? 'Verifying...' : 'Verify Code'}
            </button>

            <button
              type="button"
              onClick={handleResendOTP}
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '8px 16px',
                fontSize: '14px',
                backgroundColor: 'transparent',
                color: '#2F5D50',
                border: 'none',
                cursor: 'pointer',
                marginBottom: '4px',
              }}
            >
              Resend Code
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('email');
                setOtp('');
                setFlowId(null);
                setError('');
              }}
              disabled={isSubmitting}
              style={{
                width: '100%',
                padding: '8px 16px',
                fontSize: '14px',
                backgroundColor: 'transparent',
                color: '#8FAAA1',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ← Back to email
            </button>

            {error && (
              <p style={{
                color: '#8B3A3A',
                fontSize: '14px',
                marginTop: '12px',
                textAlign: 'center',
              }}>
                {error}
              </p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
