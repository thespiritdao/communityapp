/**
 * Invite Code Modal
 *
 * Sacred entry experience for SpiritDAO
 * First-time user modal with keyscroll background and ritual design
 *
 * Features:
 * - Keyscroll parchment background
 * - Sacred, grounded design system
 * - Real-time input validation
 * - Auto-uppercase formatting
 * - First user exception (bypasses invite requirement)
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { OnboardingHatMinting } from './OnboardingHatMinting';

interface InviteCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onValidate: (code: string) => Promise<boolean>;
  onHatMinted: (txHash: string) => Promise<void>;
  walletAddress: string;
  isFirstUser?: boolean;
}

type OnboardingStep = 'invite' | 'minting' | 'complete';

export function InviteCodeModal({
  isOpen,
  onClose,
  onValidate,
  onHatMinted,
  walletAddress,
  isFirstUser = false,
}: InviteCodeModalProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('invite');

  // Auto-bypass for first user - go straight to minting
  useEffect(() => {
    if (isFirstUser && isOpen && currentStep === 'invite') {
      setCurrentStep('minting');
    }
  }, [isFirstUser, isOpen, currentStep]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Auto-uppercase and limit to 6 characters
    const value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
    setInviteCode(value);
    setError(null); // Clear error on input change
  };

  const handleSubmit = async () => {
    // Validate code format (unless first user)
    if (!isFirstUser && inviteCode.length !== 6) {
      setError('Invite code must be 6 characters');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const isValid = await onValidate(inviteCode || '');

      if (isValid) {
        // Move to minting step
        setCurrentStep('minting');
      } else {
        setError('Invalid invite code. Please check and try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleHatMintSuccess = async (txHash: string) => {
    console.log('✅ Hat minted:', txHash);
    setCurrentStep('complete');

    // Call completion callback
    await onHatMinted(txHash);

    // Auto-close after brief delay
    setTimeout(() => {
      onClose();
    }, 2000);
  };

  const handleHatMintError = (error: Error) => {
    console.error('❌ Hat minting failed:', error);
    setError('Failed to grant access. Please try again.');
    setCurrentStep('invite');
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inviteCode.length === 6) {
      handleSubmit();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-lg p-0 bg-transparent border-none shadow-none"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Step 1: Sacred Invite Code Entry */}
        {currentStep === 'invite' && (
          <div className="relative w-full max-w-lg mx-auto">
            {/* Keyscroll Background Container */}
            <div
              className="relative"
              style={{
                backgroundImage: 'url(/images/keyscroll.png)',
                backgroundSize: 'contain',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                minHeight: '500px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Content Overlay on Scroll */}
              <div
                className="relative z-10 px-12 py-16"
                style={{
                  maxWidth: '400px',
                  textAlign: 'center',
                }}
              >
                {/* Welcome Message */}
                <h2
                  style={{
                    fontSize: '24px',
                    fontWeight: '600',
                    color: '#3A3A3A',
                    marginBottom: '16px',
                    letterSpacing: '0.02em',
                  }}
                >
                  Welcome, Traveler...
                </h2>

                <p
                  style={{
                    fontSize: '16px',
                    color: '#5F5A54',
                    marginBottom: '24px',
                    lineHeight: '1.6',
                  }}
                >
                  Has a key found you yet?
                  <br />
                  If so, share its code:
                </p>

                {/* Input Field */}
                <div className="mb-4">
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={handleInputChange}
                    onKeyPress={handleKeyPress}
                    placeholder="ABC123"
                    maxLength={6}
                    disabled={isValidating}
                    autoFocus
                    style={{
                      width: '100%',
                      textAlign: 'center',
                      fontSize: '28px',
                      fontFamily: 'monospace',
                      fontWeight: '600',
                      letterSpacing: '8px',
                      color: '#3A3A3A',
                      background: 'rgba(255, 255, 255, 0.85)',
                      border: error ? '2px solid #8B3A3A' : '2px solid #D8D2C8',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      textTransform: 'uppercase',
                      outline: 'none',
                      transition: 'all 0.2s ease',
                    }}
                    onFocus={(e) => {
                      e.target.style.border = '2px solid #2F5D50';
                    }}
                    onBlur={(e) => {
                      e.target.style.border = error
                        ? '2px solid #8B3A3A'
                        : '2px solid #D8D2C8';
                    }}
                  />
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#8FAAA1',
                      marginTop: '8px',
                    }}
                  >
                    {inviteCode.length}/6 characters
                  </p>
                </div>

                {/* Error Message */}
                {error && (
                  <div
                    style={{
                      marginBottom: '16px',
                      padding: '12px',
                      background: 'rgba(139, 58, 58, 0.1)',
                      border: '1px solid #8B3A3A',
                      borderRadius: '8px',
                    }}
                  >
                    <p
                      style={{
                        fontSize: '14px',
                        color: '#8B3A3A',
                        textAlign: 'center',
                      }}
                    >
                      {error}
                    </p>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  onClick={handleSubmit}
                  disabled={inviteCode.length !== 6 || isValidating}
                  style={{
                    width: '100%',
                    background:
                      inviteCode.length === 6 && !isValidating
                        ? '#2F5D50'
                        : '#8FAAA1',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '12px',
                    padding: '12px 18px',
                    fontSize: '16px',
                    fontWeight: '500',
                    letterSpacing: '0.02em',
                    cursor:
                      inviteCode.length === 6 && !isValidating
                        ? 'pointer'
                        : 'not-allowed',
                    opacity: inviteCode.length === 6 && !isValidating ? 1 : 0.6,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (inviteCode.length === 6 && !isValidating) {
                      e.currentTarget.style.background = '#254A40';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (inviteCode.length === 6 && !isValidating) {
                      e.currentTarget.style.background = '#2F5D50';
                    }
                  }}
                >
                  {isValidating ? (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                      }}
                    >
                      <svg
                        className="animate-spin"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                      >
                        <circle cx="12" cy="12" r="10" opacity="0.25" />
                        <path
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          opacity="0.75"
                          fill="currentColor"
                        />
                      </svg>
                      Seeking...
                    </span>
                  ) : (
                    'Enter'
                  )}
                </button>

                {/* Footer Note */}
                <p
                  style={{
                    marginTop: '20px',
                    fontSize: '12px',
                    color: '#8FAAA1',
                    fontStyle: 'italic',
                  }}
                >
                  30-day beta journey on Base Mainnet
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Hat Minting - Sacred Transaction */}
        {currentStep === 'minting' && (
          <div
            className="relative w-full max-w-md mx-auto"
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '16px',
              padding: '32px',
              boxShadow: '0 8px 24px rgba(47, 93, 80, 0.15)',
              border: '1px solid #D8D2C8',
            }}
          >
            <div className="text-center mb-6">
              <h3
                style={{
                  fontSize: '20px',
                  fontWeight: '600',
                  color: '#3A3A3A',
                  marginBottom: '8px',
                  letterSpacing: '0.02em',
                }}
              >
                {isFirstUser ? '👑 Founding Member' : '🗝️ Beta Tester Access'}
              </h3>
              <p
                style={{
                  fontSize: '14px',
                  color: '#5F5A54',
                  lineHeight: '1.5',
                }}
              >
                {isFirstUser
                  ? 'You are receiving full platform access as the founding member.'
                  : 'You are receiving temporary permissions for 30-day exploration.'}
              </p>
            </div>

            <OnboardingHatMinting
              walletAddress={walletAddress as `0x${string}`}
              isFirstUser={isFirstUser}
              onSuccess={handleHatMintSuccess}
              onError={handleHatMintError}
            />

            {/* Error Message */}
            {error && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '12px',
                  background: 'rgba(139, 58, 58, 0.1)',
                  border: '1px solid #8B3A3A',
                  borderRadius: '8px',
                }}
              >
                <p
                  style={{
                    fontSize: '14px',
                    color: '#8B3A3A',
                    textAlign: 'center',
                  }}
                >
                  {error}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Complete - Sacred Confirmation */}
        {currentStep === 'complete' && (
          <div
            className="relative w-full max-w-md mx-auto"
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '16px',
              padding: '48px 32px',
              boxShadow: '0 8px 24px rgba(47, 93, 80, 0.15)',
              border: '1px solid #D8D2C8',
              textAlign: 'center',
            }}
          >
            <div className="mb-6">
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#3F7A5A"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ margin: '0 auto' }}
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>

            <h3
              style={{
                fontSize: '24px',
                fontWeight: '600',
                color: '#3A3A3A',
                marginBottom: '12px',
                letterSpacing: '0.02em',
              }}
            >
              Welcome, Friend
            </h3>

            <p
              style={{
                fontSize: '15px',
                color: '#5F5A54',
                marginBottom: '24px',
                lineHeight: '1.6',
              }}
            >
              Your access has been granted.
              <br />
              The path opens before you...
            </p>

            <div className="flex justify-center">
              <svg
                className="animate-spin"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#2F5D50"
                strokeWidth="3"
              >
                <circle cx="12" cy="12" r="10" opacity="0.25" />
                <path
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  opacity="0.75"
                  fill="#2F5D50"
                />
              </svg>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
