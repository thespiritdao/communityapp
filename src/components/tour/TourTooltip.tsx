'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useTour } from '@/context/TourContext';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TourTooltipProps {
  spotlightRect: SpotlightRect | null;
}

const TOOLTIP_WIDTH = 300;
const TOOLTIP_GAP = 16; // gap between spotlight edge and tooltip
const EDGE = 12; // minimum distance from any viewport edge
// Used only before the first measurement. The real height is read from the
// DOM, because a guess here is exactly what let the Finish button slide
// under the bottom nav on short screens.
const FALLBACK_HEIGHT = 260;

/** Height of the fixed bottom nav, published by MobileBottomNav as a CSS var. */
function bottomNavHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--bottom-nav-height');
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 64;
}

export function TourTooltip({ spotlightRect }: TourTooltipProps) {
  const {
    currentStep,
    currentStepIndex,
    totalSteps,
    isLastStep,
    nextStep,
    prevStep,
    skipTour,
    completeTour,
  } = useTour();

  const ref = useRef<HTMLDivElement>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});

  // Layout effect so the measured height is applied before paint. Re-runs on
  // step/spotlight change; the ResizeObserver re-runs it when the card's own
  // height changes (text wraps, fonts load, viewport rotates).
  useLayoutEffect(() => {
    if (!currentStep) return;

    const place = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const navH = bottomNavHeight();
      // The band the tooltip may occupy: below the top edge, above the nav.
      const minTop = EDGE;
      const maxBottom = vh - navH - EDGE;
      const available = Math.max(120, maxBottom - minTop);

      const measured = ref.current?.offsetHeight ?? 0;
      const tooltipHeight = Math.min(measured || FALLBACK_HEIGHT, available);

      let top = 0;
      let left = 0;

      if (!spotlightRect) {
        // No spotlight: centre within the usable band.
        top = minTop + (available - tooltipHeight) / 2;
        left = vw / 2 - TOOLTIP_WIDTH / 2;
      } else {
        const spotBottom = spotlightRect.top + spotlightRect.height;
        const spotRight = spotlightRect.left + spotlightRect.width;

        const fitsBelow = spotBottom + TOOLTIP_GAP + tooltipHeight <= maxBottom;
        const fitsAbove = spotlightRect.top - TOOLTIP_GAP - tooltipHeight >= minTop;

        // Honour the requested side only when it actually fits; otherwise
        // flip. If neither fits, 'bottom' and the clamp below keep the card
        // fully inside the band (it will overlap the spotlight, which beats
        // hiding the buttons).
        const requested = currentStep.placement ?? 'auto';
        let resolved: 'top' | 'bottom' | 'left' | 'right';
        if (requested === 'left' || requested === 'right') {
          resolved = requested;
        } else if (requested === 'top') {
          resolved = fitsAbove ? 'top' : fitsBelow ? 'bottom' : 'top';
        } else {
          resolved = fitsBelow ? 'bottom' : fitsAbove ? 'top' : 'bottom';
        }

        if (resolved === 'bottom') {
          top = spotBottom + TOOLTIP_GAP;
          left = spotlightRect.left + spotlightRect.width / 2 - TOOLTIP_WIDTH / 2;
        } else if (resolved === 'top') {
          top = spotlightRect.top - TOOLTIP_GAP - tooltipHeight;
          left = spotlightRect.left + spotlightRect.width / 2 - TOOLTIP_WIDTH / 2;
        } else if (resolved === 'left') {
          top = spotlightRect.top + spotlightRect.height / 2 - tooltipHeight / 2;
          left = spotlightRect.left - TOOLTIP_WIDTH - TOOLTIP_GAP;
        } else {
          top = spotlightRect.top + spotlightRect.height / 2 - tooltipHeight / 2;
          left = spotRight + TOOLTIP_GAP;
        }
      }

      // Clamp: never past the side edges, never under the bottom nav.
      left = Math.max(EDGE, Math.min(left, vw - TOOLTIP_WIDTH - EDGE));
      top = Math.max(minTop, Math.min(top, maxBottom - tooltipHeight));

      setTooltipStyle({
        position: 'fixed',
        top,
        left,
        width: Math.min(TOOLTIP_WIDTH, vw - EDGE * 2),
        // Last resort on very short screens: scroll inside the card rather
        // than lose the buttons.
        maxHeight: available,
        overflowY: 'auto',
        transition: 'top 0.3s ease, left 0.3s ease',
      });
    };

    place();

    const ro = typeof ResizeObserver !== 'undefined' && ref.current ? new ResizeObserver(place) : null;
    if (ro && ref.current) ro.observe(ref.current);
    window.addEventListener('resize', place);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [currentStep, spotlightRect]);

  if (!currentStep) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Tour step ${currentStepIndex + 1} of ${totalSteps}: ${currentStep.title}`}
      style={{
        ...tooltipStyle,
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.24)',
        padding: '20px',
        boxSizing: 'border-box',
        zIndex: 99999,
      }}
    >
      {/* Step counter + skip */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <span
          style={{
            fontSize: '12px',
            fontWeight: '600',
            color: '#8FAAA1',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {currentStepIndex + 1} / {totalSteps}
        </span>
        <button
          onClick={skipTour}
          style={{
            background: 'none',
            border: 'none',
            color: '#8FAAA1',
            fontSize: '13px',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: '4px',
          }}
          aria-label="Skip tour"
        >
          Skip
        </button>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: '3px',
          backgroundColor: '#E8E4DC',
          borderRadius: '2px',
          marginBottom: '16px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${((currentStepIndex + 1) / totalSteps) * 100}%`,
            backgroundColor: '#2F5D50',
            borderRadius: '2px',
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: '17px',
          fontWeight: '700',
          color: '#2F2F2F',
          marginBottom: '8px',
          lineHeight: '1.3',
        }}
      >
        {currentStep.title}
      </h3>

      {/* Description */}
      <p
        style={{
          fontSize: '14px',
          color: '#5F5A54',
          lineHeight: '1.55',
          marginBottom: '20px',
        }}
      >
        {currentStep.description}
      </p>

      {/* Navigation buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {currentStepIndex > 0 && (
          <button
            onClick={prevStep}
            style={{
              flex: '0 0 auto',
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid #E8E4DC',
              backgroundColor: '#FFFFFF',
              color: '#5F5A54',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            ← Back
          </button>
        )}

        <button
          onClick={isLastStep ? completeTour : nextStep}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: '#2F5D50',
            color: '#FFFFFF',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          {isLastStep ? 'Finish' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
