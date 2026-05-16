'use client';

import { useState } from 'react';
import DonateTab from '../claims/DonateTab';
import ClaimTab from './ClaimTab';
import { HeartHandshake, Coins } from 'lucide-react';

export default function DonateClaimPage() {
  const [activeTab, setActiveTab] = useState<'donate' | 'claim'>('donate');

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F5F4ED',
        paddingBottom: 'var(--bottom-nav-height, 80px)',
      }}
    >
      <div
        style={{
          maxWidth: '600px',
          margin: '0 auto',
          padding: '24px',
        }}
      >
        {/* Header */}
        <div
          style={{
            textAlign: 'center',
            marginBottom: '24px',
          }}
        >
          <h1
            style={{
              fontSize: '32px',
              fontWeight: 'bold',
              color: '#2F5D50',
              marginBottom: '8px',
            }}
          >
            Donate & Claim
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: '#6B7280',
              margin: 0,
            }}
          >
            Support SpiritDAO or redeem your tokens
          </p>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '24px',
            background: 'white',
            padding: '8px',
            borderRadius: '12px',
            border: '1px solid #E5E7EB',
          }}
        >
          <button
            onClick={() => setActiveTab('donate')}
            style={{
              flex: 1,
              padding: '12px 16px',
              fontSize: '16px',
              fontWeight: '600',
              color: activeTab === 'donate' ? '#FFFFFF' : '#374151',
              background: activeTab === 'donate' ? '#2F5D50' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s',
            }}
          >
            <HeartHandshake size={20} />
            Donate
          </button>
          <button
            onClick={() => setActiveTab('claim')}
            style={{
              flex: 1,
              padding: '12px 16px',
              fontSize: '16px',
              fontWeight: '600',
              color: activeTab === 'claim' ? '#FFFFFF' : '#374151',
              background: activeTab === 'claim' ? '#2F5D50' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s',
            }}
          >
            <Coins size={20} />
            Claim
          </button>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'donate' ? <DonateTab /> : <ClaimTab />}
        </div>
      </div>
    </div>
  );
}
