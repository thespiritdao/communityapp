// src/wallet/components/EmbeddedWalletAuth.tsx
'use client';

import { useState } from 'react';
import { useSignInWithEmail, useVerifyEmailOTP, useSignInWithOAuth, useCurrentUser, useEvmAddress } from '@coinbase/cdp-hooks';

interface EmbeddedWalletAuthProps {
  isLoading?: boolean;
}

export function EmbeddedWalletAuth({ isLoading }: EmbeddedWalletAuthProps) {
  const { currentUser } = useCurrentUser();
  const { evmAddress } = useEvmAddress();
  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();
  const { signInWithOAuth } = useSignInWithOAuth();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [flowId, setFlowId] = useState<string | null>(null);
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If user is already signed in, show welcome message
  if (currentUser && evmAddress) {
    return (
      <div className="button enter-button" style={{ cursor: 'default' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '18px', marginBottom: '8px' }}>Welcome!</p>
          <p style={{ fontSize: '14px', opacity: 0.8 }}>
            {evmAddress.substring(0, 6)}...
            {evmAddress.substring(38)}
          </p>
        </div>
      </div>
    );
  }

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

      // Wallet will be created automatically, currentUser will update
    } catch (err: any) {
      console.error('❌ OTP verification failed:', err);
      setError(err.message || 'Invalid OTP. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsSubmitting(true);

    try {
      console.log('🔐 Signing in with Google...');
      await signInWithOAuth('google');
    } catch (err: any) {
      console.error('❌ Google sign-in failed:', err);
      setError(err.message || 'Failed to sign in with Google');
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
              color: '#DC2626',
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
                color: '#DC2626',
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
