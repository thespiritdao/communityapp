'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useReadContracts } from 'wagmi';
import {
  TENURE_BANDS,
  CURIOUS_BAND,
  bandForTier,
  formatLifetimeHours,
  type TenureBand as TenureBandType,
} from '../config/tenureBands';

/**
 * Tenure — the member's ecosystem-wide $SELF prestige standing (Curious→Elder).
 *
 * Reads the on-chain SelfPrestige contract:
 *   - tierOf(wallet) → current tier number (0..5)
 *   - lifetimeHours(wallet) → cumulative earned $SELF (wei, 1e18 = 1h)
 *
 * Membership floor (D-19b): a Proof-of-Curiosity holder is at least "Curious"
 * even with 0 on-chain hours. We pass `isMember` so the component shows the
 * Curious band as the floor when on-chain tier is 0 but the user is a member.
 *
 * Renders nothing if SelfPrestige isn't configured yet (pre-Phase-0-deploy),
 * so this is safe to mount before the contract exists.
 */

const SELF_PRESTIGE = process.env.NEXT_PUBLIC_SELF_PRESTIGE as
  | `0x${string}`
  | undefined;

const PRESTIGE_ABI = [
  {
    name: 'tierOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ type: 'uint8' }],
  },
  {
    name: 'lifetimeHours',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

interface TenureBandProps {
  walletAddress: string;
  /** True if the user holds Proof of Curiosity (drives the membership floor). */
  isMember?: boolean;
}

export const TenureBand: React.FC<TenureBandProps> = React.memo(
  ({ walletAddress, isMember = true }) => {
    const [showDetails, setShowDetails] = useState(false);

    const { data, isLoading } = useReadContracts({
      contracts: [
        {
          address: SELF_PRESTIGE,
          abi: PRESTIGE_ABI,
          functionName: 'tierOf',
          args: [walletAddress as `0x${string}`],
        },
        {
          address: SELF_PRESTIGE,
          abi: PRESTIGE_ABI,
          functionName: 'lifetimeHours',
          args: [walletAddress as `0x${string}`],
        },
      ],
      query: { enabled: !!SELF_PRESTIGE && !!walletAddress },
    });

    // Not configured yet (pre-deploy) — render nothing.
    if (!SELF_PRESTIGE) return null;

    if (isLoading) {
      return (
        <div className="loading">
          <p>Loading tenure…</p>
        </div>
      );
    }

    const onChainTier = Number(data?.[0]?.result ?? 0);
    const lifetime = (data?.[1]?.result as bigint | undefined) ?? 0n;

    // Membership floor: members with no on-chain hours still show as Curious.
    const effectiveTier =
      onChainTier > 0 ? onChainTier : isMember ? CURIOUS_BAND.tier : 0;
    const band: TenureBandType | null = bandForTier(effectiveTier);

    if (!band) {
      // Not a member and no hours — nothing to show.
      return null;
    }

    return (
      <div className="tenure-band">
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          className="tenure-card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            textAlign: 'left',
          }}
          aria-label={`Tenure band: ${band.name}. View details.`}
        >
          <Image
            src={band.image}
            alt={band.name}
            width={64}
            height={64}
            style={{ borderRadius: '12px', objectFit: 'cover' }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: '1rem', color: '#2F5D50' }}>
              {band.name}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
              {formatLifetimeHours(lifetime)} lifetime · tap for details
            </div>
          </div>
        </button>

        {showDetails && (
          <TenureDetailsModal
            currentTier={effectiveTier}
            lifetime={lifetime}
            onClose={() => setShowDetails(false)}
          />
        )}
      </div>
    );
  },
);

TenureBand.displayName = 'TenureBand';

/** Modal describing all bands, highlighting the member's current one. */
const TenureDetailsModal: React.FC<{
  currentTier: number;
  lifetime: bigint;
  onClose: () => void;
}> = ({ currentTier, lifetime, onClose }) => {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '16px',
          maxWidth: '480px',
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}
        >
          <h2 style={{ margin: 0, color: '#2F5D50' }}>Tenure</h2>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', fontSize: '1.5rem', cursor: 'pointer' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: 0 }}>
          Your standing grows with verified participation over time ($SELF earned,
          ecosystem-wide). It is permanent — it only ever rises, and spending your
          $SELF never lowers it. You currently hold{' '}
          <strong>{formatLifetimeHours(lifetime)}</strong> of lifetime
          participation.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
          {TENURE_BANDS.map((b) => {
            const isCurrent = b.tier === currentTier;
            const range =
              b.maxHours === null ? `${b.minHours}+ hrs` : `${b.minHours}–${b.maxHours} hrs`;
            return (
              <div
                key={b.tier}
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                  padding: '0.75rem',
                  borderRadius: '12px',
                  background: isCurrent ? '#E8F1EE' : '#f9fafb',
                  border: isCurrent ? '2px solid #2F5D50' : '1px solid #e5e7eb',
                }}
              >
                <Image
                  src={b.image}
                  alt={b.name}
                  width={48}
                  height={48}
                  style={{ borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontWeight: 600, color: '#2F5D50' }}>
                    {b.name}{' '}
                    <span style={{ fontWeight: 400, fontSize: '0.8rem', color: '#6b7280' }}>
                      · {range}
                    </span>
                    {isCurrent && (
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '0.7rem',
                          background: '#2F5D50',
                          color: '#fff',
                          padding: '2px 8px',
                          borderRadius: '999px',
                        }}
                      >
                        You
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#4b5563', marginTop: '2px' }}>
                    {b.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
