'use client';

import React, { useState, useEffect } from 'react';
import { loadStripe, Stripe, StripeElements } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { useAccount } from 'wagmi';
import { toast } from 'react-hot-toast';

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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Donation Summary */}
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Donation Amount:</span>
          <span className="font-semibold">${donationData.amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Platform Fee (7.5%):</span>
          <span className="text-gray-600 dark:text-gray-400">-${donationData.platformFee}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">Processing Fee (est):</span>
          <span className="text-gray-600 dark:text-gray-400">-${donationData.estimatedStripeFee}</span>
        </div>
        <div className="border-t border-gray-300 dark:border-gray-600 pt-2 mt-2">
          <div className="flex justify-between">
            <span className="font-bold">You'll Receive:</span>
            <span className="font-bold text-green-600 dark:text-green-400">
              {donationData.systemTokens} $SYSTEM
            </span>
          </div>
        </div>
      </div>

      {/* Payment Methods Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-sm space-y-2">
        <p className="font-semibold text-blue-900 dark:text-blue-200">💳 Payment Options:</p>
        <ul className="text-blue-800 dark:text-blue-300 space-y-1 ml-4">
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
      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg text-xs">
        <p className="text-yellow-800 dark:text-yellow-300">
          ⚠️ <strong>No Refund Policy:</strong> All donations are final and non-refundable.
          Tokens will be minted after settlement period (3-7 days for cards, instant for ACH).
        </p>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
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
  const { address: walletAddress, isConnected } = useAccount();
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
              ✅ Executive Pod approval (2-of-3 multi-sig)
            </p>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You'll receive an email confirmation when your tokens are minted.
          </p>
          <button
            onClick={handleNewDonation}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Make Another Donation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Support SpiritDAO
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Donate and receive $SYSTEM tokens (1:1 with USD)
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 md:p-8">
          {!clientSecret ? (
            // Donation Amount Form
            <div className="space-y-6">
              {/* Wallet Connection Status */}
              {!isConnected && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-600 p-4 rounded-lg">
                  <p className="text-yellow-800 dark:text-yellow-300 text-sm">
                    ⚠️ Please connect your wallet to receive $SYSTEM tokens
                  </p>
                </div>
              )}

              {/* Connected Wallet Display */}
              {isConnected && walletAddress && (
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    Tokens will be sent to:
                  </p>
                  <p className="font-mono text-sm text-gray-900 dark:text-white break-all">
                    {walletAddress}
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
                      className={`py-3 px-4 rounded-lg font-semibold transition-colors ${
                        donationAmount === amount.toString()
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
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
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
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
                  <li>4. Executive Pod approves (2-of-3 multi-sig)</li>
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
