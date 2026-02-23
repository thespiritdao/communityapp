'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTour } from '@/context/TourContext';
import { TourTooltip } from './TourTooltip';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8; // extra space around the highlighted element

export function TourOverlay() {
  const { isActive, currentStep } = useTour();
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const rafRef = useRef<number | null>(null);

  const updateSpotlight = useCallback(() => {
    if (!currentStep) {
      setSpotlightRect(null);
      return;
    }

    const el = document.querySelector(`[data-tour="${currentStep.id}"]`);
    if (!el) {
      // Element not found — no spotlight, tooltip still shows centred
      setSpotlightRect(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    setSpotlightRect({
      top: rect.top - PADDING,
      left: rect.left - PADDING,
      width: rect.width + PADDING * 2,
      height: rect.height + PADDING * 2,
    });

    // Scroll element into view smoothly
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentStep]);

  // Recalculate on step change and on resize
  useEffect(() => {
    if (!isActive) return;

    // Slight delay to allow scroll + layout to settle
    const timer = setTimeout(updateSpotlight, 120);

    const handleResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateSpotlight);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, currentStep, updateSpotlight]);

  if (!isActive) return null;

  // The spotlight uses a massive box-shadow to darken everything outside the rect.
  // This avoids SVG clip-path complexity and works on all mobile browsers.
  const overlayStyle: React.CSSProperties = spotlightRect
    ? {
        position: 'fixed',
        top: spotlightRect.top,
        left: spotlightRect.left,
        width: spotlightRect.width,
        height: spotlightRect.height,
        borderRadius: '12px',
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.72)',
        zIndex: 99998,
        pointerEvents: 'none',
        transition: 'top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease',
      }
    : {
        // No element found — just a full dark backdrop
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
        zIndex: 99998,
        pointerEvents: 'none',
      };

  return (
    <>
      {/* Spotlight cutout */}
      <div style={overlayStyle} aria-hidden="true" />

      {/* Tooltip card */}
      <TourTooltip spotlightRect={spotlightRect} />
    </>
  );
}
