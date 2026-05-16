'use client';

import React from 'react';
import Link from 'next/link';

export default function DirectDonationSuccessPage() {
  return (
    <div className="min-h-screen bg-[#f5f4ed] dark:bg-[#1A2E28] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-[#1A3A30] rounded-xl shadow-lg p-8 text-center space-y-6">
        <div className="text-6xl">
          <span role="img" aria-label="heart">&#x1F49A;</span>
        </div>
        <h1 className="text-3xl font-bold text-[#1F453A] dark:text-white">
          Thank You!
        </h1>
        <p className="text-[#5F5A54] dark:text-[#D1C4A9]">
          Your direct donation to SpiritDAO has been received. You are directly supporting the infrastructure that empowers communities around the world.
        </p>

        <div
          style={{
            backgroundColor: '#E8F1EE',
            border: '1px solid #B8D9CA',
            padding: '1rem',
            borderRadius: '0.75rem',
          }}
          className="text-sm text-left space-y-2"
        >
          <p className="text-[#1F453A] dark:text-[#B8D9CA]">
            A receipt will be sent to your email from Stripe.
          </p>
          <p className="text-[#1F453A] dark:text-[#B8D9CA]">
            This donation is <strong>100% tax-deductible</strong>.
          </p>
          <p className="text-[#1F453A] dark:text-[#B8D9CA]">
            <strong>EIN:</strong> 99-1308806
          </p>
          <p className="text-[#5F5A54] dark:text-[#8FAAA1] text-xs">
            No goods or services were provided in exchange for this contribution.
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <Link
            href="/claims"
            style={{
              backgroundColor: '#2F5D50',
              color: '#FFFFFF',
              fontWeight: 500,
              padding: '0.5rem 1.5rem',
              borderRadius: '0.75rem',
              display: 'inline-block',
              transition: 'all 0.2s',
            }}
          >
            Make Another Donation
          </Link>
          <Link
            href="/"
            className="text-[#2F5D50] dark:text-[#B8D9CA] text-sm hover:underline"
          >
            Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
