'use client';

import React from 'react';
import type { SelfPaymentSelection } from '../../../services/transaction/selfPayment';

/**
 * Confirmation modal shown before a $SELF burn-to-pay purchase.
 *
 * $SELF is soulbound and burned on purchase; cross-community $SELF is accepted
 * only at a recognition "exchange rate" (weight < 100%), so the buyer may burn
 * MORE raw $SELF than the sticker price in hours. This modal makes that explicit
 * before the (irreversible) burn.
 */

const HOUR = 10n ** 18n;
const hours = (wei: string | bigint): string => {
  const w = typeof wei === 'bigint' ? wei : BigInt(wei);
  return String(Number((w * 100n) / HOUR) / 100);
};

interface Props {
  selection: SelfPaymentSelection;
  /** Sticker price in hours (price_self). */
  priceHours: number;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing?: boolean;
}

export const SelfPaymentConfirmModal: React.FC<Props> = ({
  selection,
  priceHours,
  onConfirm,
  onCancel,
  isProcessing = false,
}) => {
  const totalRaw = hours(selection.rawBurnedWei);

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '16px',
          maxWidth: '460px',
          width: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          padding: '1.5rem',
        }}
      >
        <h2 style={{ margin: 0, color: '#2F5D50' }}>Confirm $SELF payment</h2>
        <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '0.5rem' }}>
          $SELF is permanently burned to pay. Review what will be spent — this
          can&apos;t be undone.
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            background: '#E8F1EE',
            borderRadius: '12px',
            margin: '1rem 0 0.5rem',
            fontWeight: 600,
            color: '#2F5D50',
          }}
        >
          <span>Price</span>
          <span>{priceHours} $SELF</span>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            background: '#f9fafb',
            borderRadius: '12px',
            marginBottom: '0.75rem',
            fontWeight: 600,
            color: selection.usesCrossCommunity ? '#9a6a00' : '#2F5D50',
          }}
        >
          <span>You burn</span>
          <span>{totalRaw} $SELF</span>
        </div>

        {selection.usesCrossCommunity && (
          <p
            style={{
              fontSize: '0.82rem',
              color: '#9a6a00',
              background: '#FFF7E6',
              border: '1px solid #FBE3B3',
              borderRadius: '10px',
              padding: '0.6rem 0.75rem',
              margin: '0 0 0.75rem',
            }}
          >
            Some of your $SELF was earned in another community and is accepted at
            a recognition rate below 100%, so you burn a bit more than the
            sticker price.
          </p>
        )}

        <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.4rem' }}>
          Burning from {selection.legs.length} holding
          {selection.legs.length === 1 ? '' : 's'}:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {selection.legs.map((leg) => (
            <div
              key={leg.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.82rem',
                padding: '0.5rem 0.7rem',
                borderRadius: '10px',
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                color: '#374151',
              }}
            >
              <span>
                Season {leg.epoch}
                {leg.weightBps < 10000 && (
                  <span style={{ color: '#9a6a00' }}>
                    {' '}
                    · {leg.weightBps / 100}% rate
                  </span>
                )}
                {leg.decayBps < 10000 && (
                  <span style={{ color: '#6b7280' }}>
                    {' '}
                    · {leg.decayBps / 100}% value
                  </span>
                )}
              </span>
              <span style={{ fontWeight: 600 }}>{hours(leg.rawWei)} $SELF</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            style={{
              flex: 1,
              padding: '0.7rem',
              borderRadius: '10px',
              border: '1px solid #d1d5db',
              background: '#fff',
              color: '#374151',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            style={{
              flex: 1,
              padding: '0.7rem',
              borderRadius: '10px',
              border: 'none',
              background: '#2F5D50',
              color: '#fff',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              opacity: isProcessing ? 0.7 : 1,
            }}
          >
            {isProcessing ? 'Processing…' : `Burn ${totalRaw} $SELF`}
          </button>
        </div>
      </div>
    </div>
  );
};

SelfPaymentConfirmModal.displayName = 'SelfPaymentConfirmModal';
