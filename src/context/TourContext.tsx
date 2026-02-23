'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { supabase } from '@/utils/supabaseClient';

// ─── Step Definitions ────────────────────────────────────────────────────────

export interface TourStep {
  id: string;           // matches data-tour="id" on the DOM element
  title: string;
  description: string;
  // Where to position the tooltip relative to the spotlight
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

export const HOME_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to SpiritDAO',
    description:
      "This is your home — a hub for all efforts within SpiritDAO. Let's take 2 minutes to orient you.",
    placement: 'bottom',
  },
  {
    id: 'identity',
    title: 'Your Identity',
    description:
      'Your community profile. Set your name, profile picture, and interests — and track your tokens and credentials.',
    placement: 'bottom',
  },
  {
    id: 'chat',
    title: 'Chat',
    description:
      "Daily conversations. There's a General chat for all of SpiritDAO and private chats within each Pod.",
    placement: 'bottom',
  },
  {
    id: 'forum',
    title: 'Forum',
    description:
      'Longer-form discussion and proposals. Think of it as the town square for thoughtful deliberation.',
    placement: 'bottom',
  },
  {
    id: 'pods',
    title: 'Pods',
    description:
      'Working groups inside SpiritDAO. Each Pod has its own team, treasury, and governance.',
    placement: 'bottom',
  },
  {
    id: 'governance',
    title: 'Governance',
    description:
      'Vote on DAO-wide decisions. Proposals go through discussion, voting, and on-chain execution.',
    placement: 'bottom',
  },
  {
    id: 'bounties',
    title: 'Bounties',
    description:
      'Work you can claim and get paid for. Pod leaders post tasks; contributors complete them.',
    placement: 'bottom',
  },
  {
    id: 'events',
    title: 'Events',
    description:
      'In-person and digital gatherings. Register to attend and earn a proof-of-participation credential.',
    placement: 'bottom',
  },
  {
    id: 'knowledge',
    title: 'Knowledge Base',
    description:
      "The DAO's living library. Guides, research, and AI-powered search across all content.",
    placement: 'bottom',
  },
  {
    id: 'bottom-nav',
    title: 'You\'re all set',
    description:
      'Use the bottom nav to jump to Governance, Tokens, and Alerts from anywhere. Start exploring!',
    placement: 'top',
  },
];

// ─── Context Types ────────────────────────────────────────────────────────────

interface TourContextValue {
  // State
  isActive: boolean;
  currentStepIndex: number;
  steps: TourStep[];
  showPrompt: boolean;

  // Derived
  currentStep: TourStep | null;
  isLastStep: boolean;
  totalSteps: number;

  // Actions
  startTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTour: () => void;
  completeTour: () => void;
  dismissPrompt: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface TourProviderProps {
  children: React.ReactNode;
  walletAddress?: string | null;
}

export function TourProvider({ children, walletAddress }: TourProviderProps) {
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showPrompt, setShowPrompt] = useState(false);
  const hasChecked = useRef(false);

  // Check if user needs the tour (once wallet address is available)
  useEffect(() => {
    if (!walletAddress || hasChecked.current) return;
    hasChecked.current = true;

    const checkTourStatus = async () => {
      try {
        const { data } = await supabase
          .from('user_profiles')
          .select('tour_completed_at')
          .eq('wallet_address', walletAddress.toLowerCase())
          .maybeSingle();

        // Show prompt only if tour_completed_at is null/missing
        if (data && data.tour_completed_at === null) {
          // Small delay so the home page renders first
          setTimeout(() => setShowPrompt(true), 800);
        }
      } catch (err) {
        console.error('Tour: failed to check tour status', err);
      }
    };

    checkTourStatus();
  }, [walletAddress]);

  const markTourComplete = useCallback(async (skipped = false) => {
    if (!walletAddress) return;
    try {
      await supabase
        .from('user_profiles')
        .update({ tour_completed_at: new Date().toISOString() })
        .eq('wallet_address', walletAddress.toLowerCase());
      console.log(`✅ Tour: marked ${skipped ? 'skipped' : 'completed'}`);
    } catch (err) {
      console.error('Tour: failed to save completion', err);
    }
  }, [walletAddress]);

  const startTour = useCallback(() => {
    setShowPrompt(false);
    setCurrentStepIndex(0);
    setIsActive(true);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStepIndex((i) => {
      if (i < HOME_TOUR_STEPS.length - 1) return i + 1;
      return i;
    });
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const skipTour = useCallback(() => {
    setIsActive(false);
    setShowPrompt(false);
    markTourComplete(true);
  }, [markTourComplete]);

  const completeTour = useCallback(() => {
    setIsActive(false);
    markTourComplete(false);
  }, [markTourComplete]);

  const dismissPrompt = useCallback(() => {
    setShowPrompt(false);
    markTourComplete(true);
  }, [markTourComplete]);

  const currentStep = isActive ? HOME_TOUR_STEPS[currentStepIndex] : null;
  const isLastStep = currentStepIndex === HOME_TOUR_STEPS.length - 1;

  return (
    <TourContext.Provider
      value={{
        isActive,
        currentStepIndex,
        steps: HOME_TOUR_STEPS,
        showPrompt,
        currentStep,
        isLastStep,
        totalSteps: HOME_TOUR_STEPS.length,
        startTour,
        nextStep,
        prevStep,
        skipTour,
        completeTour,
        dismissPrompt,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}
