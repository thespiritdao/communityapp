'use client';

import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { useToast } from '@/components/ui/use-toast';
import { useCDPStatus } from '@/hooks/useCDPStatus';

// Load Stripe publishable key (new account — for $SYSTEM token purchases)
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_SYSTEM_PUBLISHABLE_KEY!);

type DonationType = 'ecosystem' | 'direct';

/**
 * Donation Checkout Form Component
 * Uses Stripe Elements for payment collection ($SYSTEM flow)
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
      } else if (paymentIntent?.status === 'processing') {
        toast({ title: 'Payment submitted!', description: 'Your bank transfer is processing. Tokens will be minted once funds clear (3-5 business days).' });
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
          <span className="text-[#5F5A54] dark:text-[#8FAAA1]">Fund Amount:</span>
          <span className="font-semibold">${donationData.amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#5F5A54] dark:text-[#8FAAA1]">Operations Donation (4%):</span>
          <span className="text-[#5F5A54] dark:text-[#8FAAA1]">-${donationData.operationsFee}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#5F5A54] dark:text-[#8FAAA1]">Community Fund Donation (4%):</span>
          <span className="text-[#5F5A54] dark:text-[#8FAAA1]">-${donationData.communityFee}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[#5F5A54] dark:text-[#8FAAA1]">Processing Fee (est):</span>
          <span className="text-[#5F5A54] dark:text-[#8FAAA1]">-${donationData.estimatedStripeFee}</span>
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
        <p className="font-semibold text-[#1F453A] dark:text-white">Payment Options:</p>
        <ul className="text-[#5F5A54] dark:text-[#D1C4A9] space-y-1 ml-4">
          <li>* <strong>Credit Card:</strong> 2.9% + $0.30 fee, 3-7 day hold</li>
          <li>* <strong>Bank Transfer (ACH):</strong> 0.8% fee, 3-5 day processing</li>
        </ul>
      </div>

      {/* Stripe Payment Element */}
      <div className="border border-[#D1C4A9] dark:border-[#5F5A54] rounded-lg p-4">
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
          <strong>No Refund Policy:</strong> All donations are final and non-refundable.
          Tokens will be minted after settlement period (3-7 days for cards, 3-5 days for ACH).
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
 *
 * Two donation paths:
 * 1. "Fund the Ecosystem" — Donate and receive $SYSTEM tokens (new Stripe account)
 * 2. "Direct Donation" — 100% tax-deductible, no tokens (old Stripe account via Checkout)
 */
export default function DonatePage() {
  const { address: walletAddress, isInitializing } = useCDPStatus();
  const { toast } = useToast();
  const isConnected = !!walletAddress && !isInitializing;

  // Donation type toggle
  const [donationType, setDonationType] = useState<DonationType>('ecosystem');

  // Ecosystem donation state
  const [donationAmount, setDonationAmount] = useState<string>('');
  const [donorEmail, setDonorEmail] = useState<string>('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [donationData, setDonationData] = useState<any>(null);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Direct donation state
  const [directAmount, setDirectAmount] = useState<string>('');
  const [directEmail, setDirectEmail] = useState<string>('');
  const [isRedirecting, setIsRedirecting] = useState(false);

  const ecosystemMinAmount = 10;
  const directMinAmount = 1;
  const ecosystemSuggestedAmounts = [10, 25, 50, 100, 250, 500];
  const directSuggestedAmounts = [10, 25, 50, 100, 250, 500];

  // ── Ecosystem donation handlers ───────────────────────────────

  const handleCreatePaymentIntent = async () => {
    if (!walletAddress) {
      toast({ title: 'Wallet required', description: 'Please connect your wallet first', variant: 'destructive' });
      return;
    }

    const amount = parseFloat(donationAmount);

    if (!amount || amount < ecosystemMinAmount) {
      toast({ title: 'Amount too low', description: `Minimum donation is $${ecosystemMinAmount}`, variant: 'destructive' });
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

  // ── Direct donation handlers ──────────────────────────────────

  const handleDirectDonation = async () => {
    if (!walletAddress) {
      toast({ title: 'Wallet required', description: 'Please connect your wallet first', variant: 'destructive' });
      return;
    }

    const amount = parseFloat(directAmount);

    if (!amount || amount < directMinAmount) {
      toast({ title: 'Amount too low', description: `Minimum donation is $${directMinAmount}`, variant: 'destructive' });
      return;
    }

    if (!directEmail || !directEmail.includes('@')) {
      toast({ title: 'Invalid email', description: 'Please provide a valid email address for your receipt', variant: 'destructive' });
      return;
    }

    setIsRedirecting(true);

    try {
      const response = await fetch('/api/donations/direct-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          email: directEmail,
          walletAddress,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout (hosted on old account)
      window.location.href = data.url;
    } catch (error: any) {
      toast({ title: 'Checkout failed', description: error.message || 'Failed to start checkout', variant: 'destructive' });
      setIsRedirecting(false);
    }
  };

  // ── Success screen (ecosystem only — direct has its own page) ──

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-[#f5f4ed] dark:bg-[#1A2E28] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#1A3A30] rounded-xl shadow-lg p-8 text-center space-y-6">
          <div className="text-6xl">
            <span role="img" aria-label="celebration">&#x1F389;</span>
          </div>
          <h1 className="text-3xl font-bold text-[#1F453A] dark:text-white">
            Thank You!
          </h1>
          <p className="text-[#5F5A54] dark:text-[#D1C4A9]">
            Your donation has been received. Your $SYSTEM tokens will be minted after:
          </p>
          <div className="bg-[#E8F1EE] dark:bg-[#2F5D50]/20 p-4 rounded-lg space-y-2">
            <p className="text-sm text-[#1F453A] dark:text-[#B8D9CA]">
              Settlement period (0-7 days based on payment method)
            </p>
            <p className="text-sm text-[#1F453A] dark:text-[#B8D9CA]">
              Executive Pod approval
            </p>
          </div>
          <p className="text-sm text-[#5F5A54] dark:text-[#8FAAA1]">
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
          <h1 className="text-4xl font-bold text-[#1F453A] dark:text-white mb-2">
            Support SpiritDAO
          </h1>
          <p className="text-[#5F5A54] dark:text-[#D1C4A9]">
            Choose how you'd like to contribute
          </p>
        </div>

        {/* ── Donation Type Toggle ─────────────────────────────── */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setDonationType('ecosystem')}
            style={{
              backgroundColor: donationType === 'ecosystem' ? '#2F5D50' : 'transparent',
              color: donationType === 'ecosystem' ? '#FFFFFF' : undefined,
              border: donationType === 'ecosystem' ? 'none' : '1px solid #6F8F86',
              padding: '0.75rem 1.25rem',
              borderRadius: '0.75rem',
              fontWeight: 600,
              flex: 1,
              transition: 'all 0.2s',
            }}
            className={donationType === 'ecosystem' ? '' : 'text-[#1F453A] dark:text-white hover:bg-[#E8F1EE] dark:hover:bg-[#1A3A30]'}
          >
            Fund the Ecosystem
          </button>
          <button
            onClick={() => setDonationType('direct')}
            style={{
              backgroundColor: donationType === 'direct' ? '#2F5D50' : 'transparent',
              color: donationType === 'direct' ? '#FFFFFF' : undefined,
              border: donationType === 'direct' ? 'none' : '1px solid #6F8F86',
              padding: '0.75rem 1.25rem',
              borderRadius: '0.75rem',
              fontWeight: 600,
              flex: 1,
              transition: 'all 0.2s',
            }}
            className={donationType === 'direct' ? '' : 'text-[#1F453A] dark:text-white hover:bg-[#E8F1EE] dark:hover:bg-[#1A3A30]'}
          >
            Direct Donation
          </button>
        </div>

        <div className="bg-white dark:bg-[#1A3A30] rounded-xl shadow-lg p-6 md:p-8">

          {/* ════════════════════════════════════════════════════ */}
          {/* ECOSYSTEM FUNDING PATH                              */}
          {/* ════════════════════════════════════════════════════ */}
          {donationType === 'ecosystem' && (
            <>
              {!clientSecret ? (
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
                        Please connect your wallet to receive $SYSTEM tokens
                      </p>
                    </div>
                  )}

                  {/* Suggested Amounts */}
                  <div>
                    <label className="block text-sm font-medium text-[#5F5A54] dark:text-[#D1C4A9] mb-2">
                      Select Amount
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {ecosystemSuggestedAmounts.map((amount) => (
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
                          className={donationAmount === amount.toString() ? '' : 'text-[#1F453A] dark:text-white hover:bg-[#E8F1EE] dark:hover:bg-[#1A3A30]'}
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
                      className="block text-sm font-medium text-[#5F5A54] dark:text-[#D1C4A9] mb-2"
                    >
                      Or Enter Custom Amount (min ${ecosystemMinAmount})
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-[#8FAAA1] dark:text-[#8FAAA1]">
                        $
                      </span>
                      <input
                        id="customAmount"
                        type="number"
                        min={ecosystemMinAmount}
                        step="0.01"
                        value={donationAmount}
                        onChange={(e) => setDonationAmount(e.target.value)}
                        placeholder={`${ecosystemMinAmount}.00`}
                        className="w-full pl-8 pr-4 py-3 border border-[#D1C4A9] dark:border-[#5F5A54] rounded-lg bg-white dark:bg-[#1A3A30] text-[#1F453A] dark:text-white focus:ring-2 focus:ring-[#2F5D50] focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Email Input */}
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-[#5F5A54] dark:text-[#D1C4A9] mb-2"
                    >
                      Email (for receipt and notifications)
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={donorEmail}
                      onChange={(e) => setDonorEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-4 py-3 border border-[#D1C4A9] dark:border-[#5F5A54] rounded-lg bg-white dark:bg-[#1A3A30] text-[#1F453A] dark:text-white focus:ring-2 focus:ring-[#2F5D50] focus:border-transparent"
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
                  <div className="bg-[#E8F1EE] dark:bg-[#1A3A30] p-4 rounded-lg text-sm space-y-2">
                    <p className="font-semibold text-[#1F453A] dark:text-white">
                      How it works:
                    </p>
                    <ol className="text-[#5F5A54] dark:text-[#D1C4A9] space-y-1 ml-4">
                      <li>1. Choose your donation amount</li>
                      <li>2. Complete payment (card or bank transfer)</li>
                      <li>3. Wait for settlement period (0-7 days)</li>
                      <li>4. Executive Pod approves</li>
                      <li>5. $SYSTEM tokens minted to your wallet</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: {
                      theme: 'stripe',
                      variables: {
                        colorPrimary: '#2F5D50',
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
            </>
          )}

          {/* ════════════════════════════════════════════════════ */}
          {/* DIRECT DONATION PATH                                */}
          {/* ════════════════════════════════════════════════════ */}
          {donationType === 'direct' && (
            <div className="space-y-6">
              {/* Explainer Panel */}
              <div
                style={{
                  backgroundColor: '#E8F1EE',
                  border: '1px solid #B8D9CA',
                  padding: '1.25rem',
                  borderRadius: '0.75rem',
                }}
                className="space-y-3"
              >
                <p className="font-semibold text-[#1F453A] dark:text-white text-sm">
                  About Direct Donations
                </p>
                <p className="text-sm text-[#5F5A54] dark:text-[#D1C4A9]">
                  SpiritDAO is a 501(c)(3) nonprofit (EIN: 99-1308806) providing infrastructure for mission-driven and lifestyle communities. 100% of direct donations support our operations fund, which allows us to continue offering our ecosystem for free to communities around the world.
                </p>
                <p className="text-sm text-[#5F5A54] dark:text-[#D1C4A9]">
                  Unlike ecosystem funding (which returns $SYSTEM tokens), direct donations are a charitable contribution with no goods or services provided in exchange. Your entire donation is <strong className="text-[#1F453A] dark:text-[#B8D9CA]">tax-deductible to the full extent permitted by law</strong>.
                </p>
                <p className="text-xs text-[#8FAAA1]">
                  No goods or services are provided in exchange for this contribution. You will receive a receipt via email for your tax records.
                </p>
              </div>

              {/* Suggested Amounts */}
              <div>
                <label className="block text-sm font-medium text-[#5F5A54] dark:text-[#D1C4A9] mb-2">
                  Select Amount
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {directSuggestedAmounts.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setDirectAmount(amount.toString())}
                      style={{
                        backgroundColor: directAmount === amount.toString() ? '#2F5D50' : 'transparent',
                        color: directAmount === amount.toString() ? '#FFFFFF' : undefined,
                        border: directAmount === amount.toString() ? 'none' : '1px solid #6F8F86',
                        padding: '0.75rem 1rem',
                        borderRadius: '0.75rem',
                        fontWeight: 500,
                        transition: 'all 0.2s'
                      }}
                      className={directAmount === amount.toString() ? '' : 'text-[#1F453A] dark:text-white hover:bg-[#E8F1EE] dark:hover:bg-[#1A3A30]'}
                    >
                      ${amount}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Amount */}
              <div>
                <label
                  htmlFor="directCustomAmount"
                  className="block text-sm font-medium text-[#5F5A54] dark:text-[#D1C4A9] mb-2"
                >
                  Or Enter Custom Amount (min ${directMinAmount})
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-[#8FAAA1] dark:text-[#8FAAA1]">
                    $
                  </span>
                  <input
                    id="directCustomAmount"
                    type="number"
                    min={directMinAmount}
                    step="0.01"
                    value={directAmount}
                    onChange={(e) => setDirectAmount(e.target.value)}
                    placeholder={`${directMinAmount}.00`}
                    className="w-full pl-8 pr-4 py-3 border border-[#D1C4A9] dark:border-[#5F5A54] rounded-lg bg-white dark:bg-[#1A3A30] text-[#1F453A] dark:text-white focus:ring-2 focus:ring-[#2F5D50] focus:border-transparent"
                  />
                </div>
              </div>

              {/* Email Input */}
              <div>
                <label
                  htmlFor="directEmail"
                  className="block text-sm font-medium text-[#5F5A54] dark:text-[#D1C4A9] mb-2"
                >
                  Email (for your tax receipt)
                </label>
                <input
                  id="directEmail"
                  type="email"
                  value={directEmail}
                  onChange={(e) => setDirectEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 border border-[#D1C4A9] dark:border-[#5F5A54] rounded-lg bg-white dark:bg-[#1A3A30] text-[#1F453A] dark:text-white focus:ring-2 focus:ring-[#2F5D50] focus:border-transparent"
                />
              </div>

              {/* Continue Button */}
              <button
                onClick={handleDirectDonation}
                disabled={!isConnected || isRedirecting || !directAmount || !directEmail}
                style={{
                  backgroundColor: (!isConnected || isRedirecting || !directAmount || !directEmail) ? '#D8D2C8' : '#2F5D50',
                  color: '#FFFFFF',
                  fontWeight: 500,
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.75rem',
                  width: '100%',
                  transition: 'all 0.2s'
                }}
              >
                {isRedirecting ? 'Redirecting to checkout...' : 'Continue to Payment'}
              </button>

              {/* No Refund Policy */}
              <div style={{
                backgroundColor: '#FAF4EC',
                border: '1px solid #E8D7B8',
                padding: '0.75rem',
                borderRadius: '0.75rem'
              }} className="text-xs">
                <p style={{ color: '#6B5A3E' }}>
                  <strong>No Refund Policy:</strong> All donations are final and non-refundable.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
