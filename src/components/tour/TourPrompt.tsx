'use client';

import { useTour } from '@/context/TourContext';

export function TourPrompt() {
  const { showPrompt, startTour, dismissPrompt } = useTour();

  if (!showPrompt) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 99997,
        }}
        onClick={dismissPrompt}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Start guided tour"
        style={{
          position: 'fixed',
          bottom: '80px', // above bottom nav
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 48px)',
          maxWidth: '360px',
          backgroundColor: '#FFFFFF',
          borderRadius: '20px',
          boxShadow: '0 12px 48px rgba(0, 0, 0, 0.2)',
          padding: '28px 24px 24px',
          zIndex: 99998,
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <div
          style={{
            fontSize: '36px',
            marginBottom: '12px',
            lineHeight: 1,
          }}
        >
          🧭
        </div>

        <h2
          style={{
            fontSize: '20px',
            fontWeight: '700',
            color: '#2F2F2F',
            marginBottom: '10px',
          }}
        >
          New here?
        </h2>

        <p
          style={{
            fontSize: '15px',
            color: '#5F5A54',
            lineHeight: '1.55',
            marginBottom: '24px',
          }}
        >
          Take a quick guided tour of SpiritDAO — we'll walk you through everything in about 2 minutes.
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            onClick={startTour}
            style={{
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: '#2F5D50',
              color: '#FFFFFF',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Start Tour (~2 min)
          </button>

          <button
            onClick={dismissPrompt}
            style={{
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid #E8E4DC',
              backgroundColor: 'transparent',
              color: '#8FAAA1',
              fontSize: '15px',
              cursor: 'pointer',
            }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </>
  );
}
