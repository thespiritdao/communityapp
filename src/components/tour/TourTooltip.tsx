'use client';

import { useEffect, useState } from 'react';
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

  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!currentStep) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tooltipHeight = 200; // approximate

    let top = 0;
    let left = 0;

    if (!spotlightRect) {
      // No spotlight — centre the tooltip
      top = vh / 2 - tooltipHeight / 2;
      left = vw / 2 - TOOLTIP_WIDTH / 2;
    } else {
      const placement = currentStep.placement ?? 'auto';
      const spotBottom = spotlightRect.top + spotlightRect.height;
      const spotRight = spotlightRect.left + spotlightRect.width;

      const fitsBelow = spotBottom + TOOLTIP_GAP + tooltipHeight < vh;
      const fitsAbove = spotlightRect.top - TOOLTIP_GAP - tooltipHeight > 0;

      const resolvedPlacement =
        placement === 'auto'
          ? fitsBelow
            ? 'bottom'
            : fitsAbove
            ? 'top'
            : 'bottom'
          : placement;

      if (resolvedPlacement === 'bottom') {
        top = spotBottom + TOOLTIP_GAP;
        left = spotlightRect.left + spotlightRect.width / 2 - TOOLTIP_WIDTH / 2;
      } else if (resolvedPlacement === 'top') {
        top = spotlightRect.top - TOOLTIP_GAP - tooltipHeight;
        left = spotlightRect.left + spotlightRect.width / 2 - TOOLTIP_WIDTH / 2;
      } else if (resolvedPlacement === 'left') {
        top = spotlightRect.top + spotlightRect.height / 2 - tooltipHeight / 2;
        left = spotlightRect.left - TOOLTIP_WIDTH - TOOLTIP_GAP;
      } else {
        // right
        top = spotlightRect.top + spotlightRect.height / 2 - tooltipHeight / 2;
        left = spotRight + TOOLTIP_GAP;
      }

      // Clamp to viewport edges
      left = Math.max(12, Math.min(left, vw - TOOLTIP_WIDTH - 12));
      top = Math.max(12, Math.min(top, vh - tooltipHeight - 12));
    }

    setTooltipStyle({
      position: 'fixed',
      top,
      left,
      width: TOOLTIP_WIDTH,
      transition: 'top 0.3s ease, left 0.3s ease',
    });
  }, [currentStep, spotlightRect]);

  if (!currentStep) return null;

  return (
    <div
      role="dialog"
      aria-label={`Tour step ${currentStepIndex + 1} of ${totalSteps}: ${currentStep.title}`}
      style={{
        ...tooltipStyle,
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.24)',
        padding: '20px',
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
