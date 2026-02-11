'use client';

import { useState } from 'react';
import FaucetTab from './FaucetTab';
import DonateTab from './DonateTab';
import { Droplets, DollarSign } from 'lucide-react';

export default function TokensPage() {
  const [activeTab, setActiveTab] = useState<'faucet' | 'donate'>('faucet');

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
            Get Tokens
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: '#6B7280',
              margin: 0,
            }}
          >
            Free claims or purchase with fiat
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
            onClick={() => setActiveTab('faucet')}
            style={{
              flex: 1,
              padding: '12px 16px',
              fontSize: '16px',
              fontWeight: '600',
              color: activeTab === 'faucet' ? '#FFFFFF' : '#374151',
              background: activeTab === 'faucet' ? '#2F5D50' : 'transparent',
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
            <Droplets size={20} />
            Free (Faucet)
          </button>
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
            <DollarSign size={20} />
            Buy (Donate)
          </button>
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'faucet' ? <FaucetTab /> : <DonateTab />}
        </div>
      </div>
    </div>
  );
}
