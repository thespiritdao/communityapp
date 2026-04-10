'use client';

import React, { useState, useEffect } from 'react';
import { loadStripe, Stripe, StripeElements } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { useToast } from '@/components/ui/use-toast';
import { useCDPStatus } from '@/hooks/useCDPStatus';

// Load Stripe publishable key
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface DonationFormData {
  amount: number;
  email: string;
}

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
  const { toast } = useToast();
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
        toast({ title: 'Payment failed', description: error.message, variant: 'destructive' });
      } else if (paymentIntent?.status === 'succeeded') {
        toast({ title: 'Donation successful!', description: 'Your tokens will be minted after settlement.' });
        onSuccess();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred');
      toast({ title: 'Error', description: err.message || 'An unexpected error occurred', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Donation Summary */}
      <div style={{
        backgroundColor: '#E8F1EE',
        border: '1px solid #B8D9CA',
        padding: '1rem',
        borderRadius: '0.75rem'
      }} className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Fund Amount:</span>
          <span className="font-semibold">${donationData.amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Operations Donation (4%):</span>
          <span className="text-gray-600 dark:text-gray-400">-${donationData.operationsFee}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Community Fund Donation (4%):</span>
          <span className="text-gray-600 dark:text-gray-400">-${donationData.communityFee}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Processing Fee (est):</span>
          <span className="text-gray-600 dark:text-gray-400">-${donationData.estimatedStripeFee}</span>
        </div>
        <div className="border-t pt-2 mt-2" style={{ borderColor: '#B8D9CA' }}>
          <div className="flex justify-between">
            <span className="font-bold">You'll Receive:</span>
            <span className="font-bold" style={{ color: '#3F7A5A' }}>
              {donationData.systemTokens} $SYSTEM
            </span>
          </div>
        </div>
      </div>

      {/* Payment Methods Info */}
      <div style={{
        backgroundColor: '#E8F1EE',
        border: '1px solid #B8D9CA',
        padding: '1rem',
        borderRadius: '0.75rem'
      }} className="text-sm space-y-2">
        <p className="font-semibold text-gray-900 dark:text-white">💳 Payment Options:</p>
        <ul className="text-gray-700 dark:text-gray-300 space-y-1 ml-4">
          <li>• <strong>Credit Card:</strong> 2.9% + $0.30 fee, 3-7 day hold</li>
          <li>• <strong>Bank Transfer (ACH):</strong> 0.8% fee, instant approval</li>
        </ul>
      </div>

      {/* Stripe Payment Element */}
      <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4">
        <PaymentElement />
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-600 p-3 rounded-lg">
          <p className="text-red-800 dark:text-red-300 text-sm">{errorMessage}</p>
        </div>
      )}

      {/* No Refund Policy */}
      <div style={{
        backgroundColor: '#FAF4EC',
        border: '1px solid #E8D7B8',
        padding: '0.75rem',
        borderRadius: '0.75rem'
      }} className="text-xs">
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
          padding: '0.75rem 1.5rem',
          borderRadius: '0.75rem',
          width: '100%',
          transition: 'all 0.2s'
        }}
      >
        {isProcessing ? 'Processing...' : `Donate $${donationData.amount.toFixed(2)}`}
      </button>
    </form>
  );
}

/**
 * Main Donation Page
 */
export default function DonatePage() {
  const { address: walletAddress, isInitializing } = useCDPStatus();
  const { toast } = useToast();
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
      toast({ title: 'Wallet required', description: 'Please connect your wallet first', variant: 'destructive' });
      return;
    }

    const amount = parseFloat(donationAmount);

    if (!amount || amount < minAmount) {
      toast({ title: 'Amount too low', description: `Minimum donation is $${minAmount}`, variant: 'destructive' });
      return;
    }

    if (!donorEmail || !donorEmail.includes('@')) {
      toast({ title: 'Invalid email', description: 'Please provide a valid email address', variant: 'destructive' });
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
    } catch (error: any) {
      toast({ title: 'Payment setup failed', description: error.message || 'Failed to initialize payment', variant: 'destructive' });
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center space-y-6">
          <div className="text-6xl">🎉</div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Thank You!
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Your donation has been received. Your $SYSTEM tokens will be minted after:
          </p>
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg space-y-2">
            <p className="text-sm text-green-800 dark:text-green-300">
              ✅ Settlement period (0-7 days based on payment method)
            </p>
            <p className="text-sm text-green-800 dark:text-green-300">
              ✅ Executive Pod approval
            </p>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You'll receive an email confirmation when your tokens are minted.
          </p>
          <button
            onClick={handleNewDonation}
            style={{
              backgroundColor: '#2F5D50',
              color: '#FFFFFF',
              fontWeight: 500,
              padding: '0.5rem 1.5rem',
              borderRadius: '0.75rem',
              transition: 'all 0.2s'
            }}
          >
            Make Another Donation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Support SpiritDAO
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Donate and receive $SYSTEM tokens
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8">
          {!clientSecret ? (
            // Donation Amount Form
            <div className="space-y-6">
              {/* Wallet Connection Status */}
              {!isConnected && (
                <div style={{
                  backgroundColor: '#FAF4EC',
                  border: '1px solid #E8D7B8',
                  padding: '1rem',
                  borderRadius: '0.75rem'
                }}>
                  <p className="text-sm" style={{ color: '#6B5A3E' }}>
                    ⚠️ Please connect your wallet to receive $SYSTEM tokens
                  </p>
                </div>
              )}

              {/* Suggested Amounts */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Amount
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {suggestedAmounts.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setDonationAmount(amount.toString())}
                      style={{
                        backgroundColor: donationAmount === amount.toString() ? '#2F5D50' : 'transparent',
                        color: donationAmount === amount.toString() ? '#FFFFFF' : undefined,
                        border: donationAmount === amount.toString() ? 'none' : '1px solid #6F8F86',
                        padding: '0.75rem 1rem',
                        borderRadius: '0.75rem',
                        fontWeight: 500,
                        transition: 'all 0.2s'
                      }}
                      className={donationAmount === amount.toString() ? '' : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'}
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
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Or Enter Custom Amount (min ${minAmount})
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-gray-500 dark:text-gray-400">
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
                    className="w-full pl-8 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Email Input */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Email (for receipt and notifications)
                </label>
                <input
                  id="email"
                  type="email"
                  value={donorEmail}
                  onChange={(e) => setDonorEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.75rem',
                  width: '100%',
                  transition: 'all 0.2s'
                }}
              >
                {isCreatingIntent ? 'Preparing...' : 'Continue to Payment'}
              </button>

              {/* Info Box */}
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg text-sm space-y-2">
                <p className="font-semibold text-gray-900 dark:text-white">
                  How it works:
                </p>
                <ol className="text-gray-600 dark:text-gray-300 space-y-1 ml-4">
                  <li>1. Choose your donation amount</li>
                  <li>2. Complete payment (card or bank transfer)</li>
                  <li>3. Wait for settlement period (0-7 days)</li>
                  <li>4. Executive Pod approves</li>
                  <li>5. $SYSTEM tokens minted to your wallet</li>
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
      </div>
    </div>
  );
}
