'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

function DonationSuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [donationDetails, setDonationDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const donationId = searchParams.get('donationId');

  useEffect(() => {
    if (donationId) {
      fetchDonationDetails();
    } else {
      setIsLoading(false);
    }
  }, [donationId]);

  const fetchDonationDetails = async () => {
    try {
      const response = await fetch(`/api/donations/create-payment-intent?donationId=${donationId}`);
      const data = await response.json();

      if (response.ok) {
        setDonationDetails(data.donation);
      }
    } catch (error) {
      console.error('Failed to fetch donation details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f5f4ed] dark:bg-[#1A2E28] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2F5D50] mx-auto mb-4"></div>
          <p className="text-[#5F5A54] dark:text-[#D1C4A9]">Loading donation details...</p>
        </div>
      </div>
    );
  }

  if (!donationId || !donationDetails) {
    return (
      <div className="min-h-screen bg-[#f5f4ed] dark:bg-[#1A2E28] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-[#1A3A30] rounded-xl shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-[#1F453A] dark:text-white mb-4">
            Donation Not Found
          </h1>
          <p className="text-[#5F5A54] dark:text-[#D1C4A9] mb-6">
            We couldn't find the donation you're looking for.
          </p>
          <Link
            href="/donate"
            className="inline-block bg-[#2F5D50] hover:bg-[#1F453A] text-white font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Make a Donation
          </Link>
        </div>
      </div>
    );
  }

  const getSettlementMessage = (paymentMethod: string) => {
    if (paymentMethod === 'us_bank_account') {
      return 'Your ACH payment will be approved instantly once Stripe confirms the transfer (typically within a few hours).';
    }
    return 'Your credit card payment will be held for 3-7 days to protect against chargebacks.';
  };

  const getStatusDisplay = (status: string) => {
    const statusMap: Record<string, { label: string; color: string; icon: string }> = {
      payment_pending: { label: 'Payment Processing', color: 'yellow', icon: '⏳' },
      awaiting_settlement: { label: 'Awaiting Settlement', color: 'blue', icon: '🕐' },
      awaiting_executive_approval: { label: 'Awaiting Approval', color: 'purple', icon: '📋' },
      pending_mint: { label: 'Approved - Minting Soon', color: 'green', icon: '✅' },
      minting: { label: 'Minting Tokens', color: 'green', icon: '🪙' },
      minted: { label: 'Tokens Minted', color: 'green', icon: '✨' },
      failed: { label: 'Payment Failed', color: 'red', icon: '❌' },
      disputed: { label: 'Disputed', color: 'red', icon: '⚠️' },
    };

    const display = statusMap[status] || { label: status, color: 'gray', icon: '❓' };

    return (
      <div className={`bg-${display.color}-50 dark:bg-${display.color}-900/20 p-4 rounded-lg text-center`}>
        <div className="text-4xl mb-2">{display.icon}</div>
        <p className={`font-semibold text-${display.color}-900 dark:text-${display.color}-200`}>
          {display.label}
        </p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f5f4ed] dark:bg-[#1A2E28] py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-4xl font-bold text-[#1F453A] dark:text-white mb-2">
            Thank You for Your Support!
          </h1>
          <p className="text-[#5F5A54] dark:text-[#D1C4A9]">
            Your donation has been received successfully
          </p>
        </div>

        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-white dark:bg-[#1A3A30] rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-[#1F453A] dark:text-white mb-4">
              Current Status
            </h2>
            {getStatusDisplay(donationDetails.status)}
          </div>

          {/* Donation Details */}
          <div className="bg-white dark:bg-[#1A3A30] rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-[#1F453A] dark:text-white mb-4">
              Donation Details
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between pb-2 border-b border-[#D1C4A9] dark:border-[#5F5A54]">
                <span className="text-[#5F5A54] dark:text-[#8FAAA1]">Amount Donated:</span>
                <span className="font-semibold text-[#1F453A] dark:text-white">
                  ${donationDetails.amount?.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between pb-2 border-b border-[#D1C4A9] dark:border-[#5F5A54]">
                <span className="text-[#5F5A54] dark:text-[#8FAAA1]">$SYSTEM Tokens:</span>
                <span className="font-semibold text-[#3F7A5A] dark:text-[#B8D9CA]">
                  {donationDetails.systemTokens}
                </span>
              </div>
              <div className="flex justify-between pb-2 border-b border-[#D1C4A9] dark:border-[#5F5A54]">
                <span className="text-[#5F5A54] dark:text-[#8FAAA1]">Payment Method:</span>
                <span className="font-semibold text-[#1F453A] dark:text-white">
                  {donationDetails.paymentMethod === 'us_bank_account' ? 'Bank Transfer (ACH)' : 'Credit Card'}
                </span>
              </div>
              {donationDetails.settlementDate && (
                <div className="flex justify-between pb-2 border-b border-[#D1C4A9] dark:border-[#5F5A54]">
                  <span className="text-[#5F5A54] dark:text-[#8FAAA1]">Settlement Date:</span>
                  <span className="font-semibold text-[#1F453A] dark:text-white">
                    {new Date(donationDetails.settlementDate).toLocaleDateString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-[#5F5A54] dark:text-[#8FAAA1]">Donation ID:</span>
                <span className="font-mono text-xs text-[#1F453A] dark:text-white">
                  {donationDetails.id}
                </span>
              </div>
            </div>
          </div>

          {/* What Happens Next */}
          <div className="bg-[#E8F1EE] dark:bg-[#2F5D50]/20 rounded-xl p-6">
            <h2 className="text-xl font-bold text-[#1F453A] dark:text-[#B8D9CA] mb-4">
              What Happens Next?
            </h2>
            <ol className="space-y-3 text-[#1F453A] dark:text-[#D1C4A9]">
              <li className="flex items-start">
                <span className="font-bold mr-2">1.</span>
                <span>
                  <strong>Payment Confirmation:</strong> Stripe processes your payment securely.
                </span>
              </li>
              <li className="flex items-start">
                <span className="font-bold mr-2">2.</span>
                <span>
                  <strong>Settlement Hold:</strong> {getSettlementMessage(donationDetails.paymentMethod || 'card')}
                </span>
              </li>
              <li className="flex items-start">
                <span className="font-bold mr-2">3.</span>
                <span>
                  <strong>Executive Approval:</strong> Two of three Executive Pod members must approve the minting.
                </span>
              </li>
              <li className="flex items-start">
                <span className="font-bold mr-2">4.</span>
                <span>
                  <strong>Token Minting:</strong> Your {donationDetails.systemTokens} $SYSTEM tokens are minted to your wallet.
                </span>
              </li>
              <li className="flex items-start">
                <span className="font-bold mr-2">5.</span>
                <span>
                  <strong>Email Confirmation:</strong> You'll receive an email when your tokens are available.
                </span>
              </li>
            </ol>
          </div>

          {/* Important Notice */}
          <div className="bg-[#FAF4EC] dark:bg-[#C6933F]/10 rounded-xl p-6">
            <h3 className="font-bold text-[#8F6B2F] dark:text-[#C6933F] mb-2">
              ⚠️ Important Notice
            </h3>
            <p className="text-[#8F6B2F] dark:text-[#C6933F] text-sm">
              All donations are final and non-refundable. Your donation supports SpiritDAO's mission
              and the $SYSTEM tokens represent your contribution to the community treasury.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/donate"
              className="flex-1 bg-[#2F5D50] hover:bg-[#1F453A] text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center"
            >
              Make Another Donation
            </Link>
            <Link
              href="/"
              className="flex-1 bg-[#E8E4DC] dark:bg-[#1A3A30] hover:bg-[#D1C4A9] dark:hover:bg-[#1F453A] text-[#1F453A] dark:text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DonationSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f5f4ed] dark:bg-[#1A2E28] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2F5D50]"></div>
      </div>
    }>
      <DonationSuccessContent />
    </Suspense>
  );
}
