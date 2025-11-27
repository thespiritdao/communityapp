/**
 * Pod Observability Hook - Monitoring and analytics
 *
 * Provides observability features while preserving existing UX.
 * Tracks performance, errors, and user interactions without
 * changing the visual experience.
 */

'use client';

import { useEffect, useCallback, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

interface PodEvent {
  type:
    | 'page_view'
    | 'member_action'
    | 'error'
    | 'performance'
    | 'user_interaction';
  podId: string;
  data: Record<string, any>;
  timestamp: number;
  userAddress?: string;
  sessionId: string;
}

interface UsePodObservabilityProps {
  podId: string;
  userAddress?: string;
  enabled?: boolean;
}

/**
 * Generate a session ID for tracking user sessions
 */
function generateSessionId(): string {
  return `pod_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Hook for pod-specific observability and monitoring
 */
export function usePodObservability({
  podId,
  userAddress,
  enabled = false, // Temporarily disabled to prevent recursion
}: UsePodObservabilityProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessionId = useRef(generateSessionId());
  const pageLoadTime = useRef(Date.now());

  // Debug logging to track hook instances
  console.log('🔍 usePodObservability CREATED:', {
    podId,
    userAddress,
    enabled,
    sessionId: sessionId.current,
    componentStack: new Error().stack
      ?.split('\n')
      .slice(1, 4)
      .map((line) => line.trim()),
  });
  const interactionCount = useRef(0);

  /**
   * Log an event to observability system
   */
  const logEvent = useCallback(
    (event: Omit<PodEvent, 'timestamp' | 'sessionId'>) => {
      if (!enabled) return;

      const fullEvent: PodEvent = {
        ...event,
        timestamp: Date.now(),
        sessionId: sessionId.current,
        userAddress,
      };

      // In development, log to console
      if (process.env.NODE_ENV === 'development') {
        console.log('Pod Event:', fullEvent);
      }

      // In production, send to analytics service
      // This could be Mixpanel, Amplitude, PostHog, etc.
      if (process.env.NODE_ENV === 'production') {
        // Example: Send to analytics service
        // analytics.track('pod_event', fullEvent);
      }

      // Store locally for debugging
      if (typeof window !== 'undefined') {
        const events = JSON.parse(localStorage.getItem('pod_events') || '[]');
        events.push(fullEvent);

        // Keep only last 100 events
        if (events.length > 100) {
          events.splice(0, events.length - 100);
        }

        localStorage.setItem('pod_events', JSON.stringify(events));
      }
    },
    [enabled, userAddress],
  );

  /**
   * Track page view
   */
  useEffect(() => {
    if (!enabled || !podId) return;

    logEvent({
      type: 'page_view',
      podId,
      data: {
        pathname,
        searchParams: Object.fromEntries(searchParams.entries()),
        referrer: document.referrer,
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, podId, pathname, searchParams]);

  /**
   * Track performance metrics
   */
  useEffect(() => {
    if (!enabled || !podId) return;

    const trackPerformance = () => {
      if ('performance' in window) {
        const navigation = performance.getEntriesByType(
          'navigation',
        )[0] as PerformanceNavigationTiming;

        logEvent({
          type: 'performance',
          podId,
          data: {
            loadTime: Date.now() - pageLoadTime.current,
            domContentLoaded:
              navigation.domContentLoadedEventEnd -
              navigation.domContentLoadedEventStart,
            networkLatency: navigation.responseEnd - navigation.requestStart,
            serverResponseTime:
              navigation.responseEnd - navigation.responseStart,
            memoryUsage: (performance as any).memory
              ? {
                  used: (performance as any).memory.usedJSHeapSize,
                  total: (performance as any).memory.totalJSHeapSize,
                  limit: (performance as any).memory.jsHeapSizeLimit,
                }
              : null,
          },
        });
      }
    };

    // Track performance after a short delay to ensure page is loaded
    const timeoutId = setTimeout(trackPerformance, 2000);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, podId]);

  /**
   * Track member-related actions
   */
  const trackMemberAction = useCallback(
    (action: string, data: Record<string, any> = {}) => {
      if (!enabled) return;

      interactionCount.current++;

      logEvent({
        type: 'member_action',
        podId,
        data: {
          action,
          interactionCount: interactionCount.current,
          ...data,
        },
      });
    },
    [enabled, podId, logEvent],
  );

  /**
   * Track errors
   */
  const trackError = useCallback(
    (error: Error, context: Record<string, any> = {}) => {
      if (!enabled) return;

      logEvent({
        type: 'error',
        podId,
        data: {
          errorMessage: error.message,
          errorStack: error.stack,
          errorName: error.name,
          context,
        },
      });
    },
    [enabled, podId, logEvent],
  );

  /**
   * Track user interactions
   */
  const trackInteraction = useCallback(
    (element: string, action: string, data: Record<string, any> = {}) => {
      if (!enabled) return;

      interactionCount.current++;

      logEvent({
        type: 'user_interaction',
        podId,
        data: {
          element,
          action,
          interactionCount: interactionCount.current,
          timestamp: Date.now(),
          ...data,
        },
      });
    },
    [enabled, podId, logEvent],
  );

  /**
   * Get observability stats for debugging
   */
  const getStats = useCallback(() => {
    if (typeof window === 'undefined') return null;

    const events = JSON.parse(
      localStorage.getItem('pod_events') || '[]',
    ) as PodEvent[];
    const podEvents = events.filter((e) => e.podId === podId);

    return {
      totalEvents: podEvents.length,
      sessionEvents: podEvents.filter((e) => e.sessionId === sessionId.current)
        .length,
      errorCount: podEvents.filter((e) => e.type === 'error').length,
      interactionCount: interactionCount.current,
      sessionDuration: Date.now() - pageLoadTime.current,
      eventTypes: podEvents.reduce(
        (acc, event) => {
          acc[event.type] = (acc[event.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }, [podId]);

  /**
   * Clear stored events (for privacy/debugging)
   */
  const clearEvents = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pod_events');
    }
  }, []);

  return {
    trackMemberAction,
    trackError,
    trackInteraction,
    getStats,
    clearEvents,
    sessionId: sessionId.current,
  };
}
