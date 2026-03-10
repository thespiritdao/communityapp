'use client';

import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { toast } from 'react-hot-toast';
import { useCDPStatus } from '@/hooks/useCDPStatus';

// Load Stripe publishable key
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

/**
 * Donation Checkout Form Component
 * Uses Stripe Elements for payment collection
 */
function DonationCheckoutForm({
  clientSecret,
  donationData,
  onSuccess,
}: {
  clientSecret: string;
  donationData: any;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/donate/success?donationId=${donationData.id}`,
        },
        redirect: 'if_required',
      });

      if (error) {
        setErrorMessage(error.message || 'Payment failed');
        toast.error(error.message || 'Payment failed');
      } else if (paymentIntent?.status === 'succeeded') {
        toast.success('Donation successful! Your tokens will be minted after settlement.');
        onSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred');
      toast.error(err.message || 'An unexpected error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Donation Summary */}
      <div
        style={{
          backgroundColor: '#E8F1EE',
          border: '1px solid #B8D9CA',
          padding: '16px',
          borderRadius: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
          <span style={{ color: '#6B7280' }}>Donation Amount:</span>
          <span style={{ fontWeight: 600 }}>${donationData.amount.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
          <span style={{ color: '#6B7280' }}>Platform Fee ({donationData.platformFeePercent ?? 8}%):</span>
          <span style={{ color: '#6B7280' }}>-${donationData.platformFee}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '8px' }}>
          <span style={{ color: '#6B7280' }}>Processing Fee (est):</span>
          <span style={{ color: '#6B7280' }}>-${donationData.estimatedStripeFee}</span>
        </div>
        <div style={{ borderTop: '1px solid #B8D9CA', paddingTop: '8px', marginTop: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700 }}>You'll Receive:</span>
            <span style={{ fontWeight: 700, color: '#3F7A5A' }}>
              {donationData.systemTokens} $SYSTEM
            </span>
          </div>
        </div>
      </div>

      {/* Payment Methods Info */}
      <div
        style={{
          backgroundColor: '#E8F1EE',
          border: '1px solid #B8D9CA',
          padding: '16px',
          borderRadius: '12px',
          fontSize: '14px',
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: '8px' }}>💳 Payment Options:</p>
        <ul style={{ marginLeft: '16px', color: '#374151' }}>
          <li>• <strong>Credit Card:</strong> 2.9% + $0.30 fee, 3-7 day hold</li>
          <li style={{ marginTop: '4px' }}>• <strong>Bank Transfer (ACH):</strong> 0.8% fee, instant approval</li>
        </ul>
      </div>

      {/* Stripe Payment Element */}
      <div style={{ border: '1px solid #D1D5DB', borderRadius: '8px', padding: '16px' }}>
        <PaymentElement />
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div
          style={{
            backgroundColor: '#FEE2E2',
            border: '1px solid #FCA5A5',
            padding: '12px',
            borderRadius: '8px',
          }}
        >
          <p style={{ color: '#991B1B', fontSize: '14px' }}>{errorMessage}</p>
        </div>
      )}

      {/* No Refund Policy */}
      <div
        style={{
          backgroundColor: '#FAF4EC',
          border: '1px solid #E8D7B8',
          padding: '12px',
          borderRadius: '12px',
          fontSize: '12px',
        }}
      >
        <p style={{ color: '#6B5A3E' }}>
          ⚠️ <strong>No Refund Policy:</strong> All donations are final and non-refundable.
          Tokens will be minted after settlement period (3-7 days for cards, instant for ACH).
        </p>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!stripe || isProcessing}
        style={{
          backgroundColor: (!stripe || isProcessing) ? '#D8D2C8' : '#2F5D50',
          color: '#FFFFFF',
          fontWeight: 500,
          padding: '12px 24px',
          borderRadius: '12px',
          width: '100%',
          border: 'none',
          cursor: (!stripe || isProcessing) ? 'not-allowed' : 'pointer',
        }}
      >
        {isProcessing ? 'Processing...' : `Donate $${donationData.amount.toFixed(2)}`}
      </button>
    </form>
  );
}

/**
 * Donate Tab Component
 */
export default function DonateTab() {
  const { address: walletAddress, isInitializing } = useCDPStatus();
  const isConnected = !!walletAddress && !isInitializing;
  const [donationAmount, setDonationAmount] = useState<string>('');
  const [donorEmail, setDonorEmail] = useState<string>('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [donationData, setDonationData] = useState<any>(null);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const minAmount = 10;
  const suggestedAmounts = [10, 25, 50, 100, 250, 500];

  const handleCreatePaymentIntent = async () => {
    if (!walletAddress) {
      toast.error('Please connect your wallet first');
      return;
    }

    const amount = parseFloat(donationAmount);

    if (!amount || amount < minAmount) {
      toast.error(`Minimum donation is $${minAmount}`);
      return;
    }

    if (!donorEmail || !donorEmail.includes('@')) {
      toast.error('Please provide a valid email address');
      return;
    }

    setIsCreatingIntent(true);

    try {
      const response = await fetch('/api/donations/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          userWallet: walletAddress,
          donorEmail,
          paymentMethodTypes: ['card', 'us_bank_account'],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create payment intent');
      }

      setClientSecret(data.clientSecret);
      setDonationData(data.donation);
      toast.success('Payment form ready!');
    } catch (error: any) {
      console.error('Payment intent creation error:', error);
      toast.error(error.message || 'Failed to initialize payment');
    } finally {
      setIsCreatingIntent(false);
    }
  };

  const handleSuccessfulPayment = () => {
    setShowSuccess(true);
    setClientSecret(null);
    setDonationData(null);
    setDonationAmount('');
    setDonorEmail('');
  };

  const handleNewDonation = () => {
    setShowSuccess(false);
  };

  // Success Screen
  if (showSuccess) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
        <div
          style={{
            maxWidth: '448px',
            width: '100%',
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '24px' }}>🎉</div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px' }}>
            Thank You!
          </h1>
          <p style={{ color: '#6B7280', marginBottom: '24px' }}>
            Your donation has been received. Your $SYSTEM tokens will be minted after:
          </p>
          <div
            style={{
              backgroundColor: '#D1FAE5',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '16px',
            }}
          >
            <p style={{ fontSize: '14px', color: '#065F46', marginBottom: '8px' }}>
              ✅ Settlement period (0-7 days based on payment method)
            </p>
            <p style={{ fontSize: '14px', color: '#065F46' }}>
              ✅ Executive Pod approval (2-of-3 multi-sig)
            </p>
          </div>
          <p style={{ fontSize: '14px', color: '#6B7280', marginBottom: '24px' }}>
            You'll receive an email confirmation when your tokens are minted.
          </p>
          <button
            onClick={handleNewDonation}
            style={{
              backgroundColor: '#2F5D50',
              color: '#FFFFFF',
              fontWeight: 500,
              padding: '8px 24px',
              borderRadius: '12px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Make Another Donation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {!clientSecret ? (
        // Donation Amount Form
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Wallet Connection Status */}
          {!isConnected && (
            <div
              style={{
                backgroundColor: '#FAF4EC',
                border: '1px solid #E8D7B8',
                padding: '16px',
                borderRadius: '12px',
              }}
            >
              <p style={{ fontSize: '14px', color: '#6B5A3E' }}>
                ⚠️ Please connect your wallet to receive $SYSTEM tokens
              </p>
            </div>
          )}

          {/* Suggested Amounts */}
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#374151' }}>
              Select Amount
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              {suggestedAmounts.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setDonationAmount(amount.toString())}
                  style={{
                    backgroundColor: donationAmount === amount.toString() ? '#2F5D50' : 'transparent',
                    color: donationAmount === amount.toString() ? '#FFFFFF' : '#374151',
                    border: donationAmount === amount.toString() ? 'none' : '1px solid #6F8F86',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  ${amount}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Amount */}
          <div>
            <label
              htmlFor="customAmount"
              style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#374151' }}
            >
              Or Enter Custom Amount (min ${minAmount})
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '12px', color: '#6B7280' }}>
                $
              </span>
              <input
                id="customAmount"
                type="number"
                min={minAmount}
                step="0.01"
                value={donationAmount}
                onChange={(e) => setDonationAmount(e.target.value)}
                placeholder={`${minAmount}.00`}
                style={{
                  width: '100%',
                  paddingLeft: '32px',
                  paddingRight: '16px',
                  paddingTop: '12px',
                  paddingBottom: '12px',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '16px',
                }}
              />
            </div>
          </div>

          {/* Email Input */}
          <div>
            <label
              htmlFor="email"
              style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px', color: '#374151' }}
            >
              Email (for receipt and notifications)
            </label>
            <input
              id="email"
              type="email"
              value={donorEmail}
              onChange={(e) => setDonorEmail(e.target.value)}
              placeholder="your@email.com"
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #D1D5DB',
                borderRadius: '8px',
                fontSize: '16px',
              }}
            />
          </div>

          {/* Continue Button */}
          <button
            onClick={handleCreatePaymentIntent}
            disabled={!isConnected || isCreatingIntent || !donationAmount || !donorEmail}
            style={{
              backgroundColor: (!isConnected || isCreatingIntent || !donationAmount || !donorEmail) ? '#D8D2C8' : '#2F5D50',
              color: '#FFFFFF',
              fontWeight: 500,
              padding: '12px 24px',
              borderRadius: '12px',
              width: '100%',
              border: 'none',
              cursor: (!isConnected || isCreatingIntent || !donationAmount || !donorEmail) ? 'not-allowed' : 'pointer',
            }}
          >
            {isCreatingIntent ? 'Preparing...' : 'Continue to Payment'}
          </button>

          {/* Info Box */}
          <div
            style={{
              backgroundColor: '#F9FAFB',
              padding: '16px',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          >
            <p style={{ fontWeight: 600, marginBottom: '8px' }}>
              How it works:
            </p>
            <ol style={{ color: '#6B7280', marginLeft: '20px' }}>
              <li>Choose your donation amount</li>
              <li>Complete payment (card or bank transfer)</li>
              <li>Wait for settlement period (0-7 days)</li>
              <li>Executive Pod approves (2-of-3 multi-sig)</li>
              <li>$SYSTEM tokens minted to your wallet</li>
            </ol>
          </div>
        </div>
      ) : (
        // Stripe Payment Form
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: 'stripe',
              variables: {
                colorPrimary: '#2563eb',
              },
            },
          }}
        >
          <DonationCheckoutForm
            clientSecret={clientSecret}
            donationData={donationData}
            onSuccess={handleSuccessfulPayment}
          />
        </Elements>
      )}
    </div>
  );
}
