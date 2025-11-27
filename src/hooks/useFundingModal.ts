'use client';

import { useState, useCallback } from 'react';

interface FundingRecipient {
  address: string;
  name: string;
  image?: string;
  description?: string;
  isTreasury?: boolean;
  podId?: string;
}

interface FundingModalState {
  isOpen: boolean;
  recipientType: 'member' | 'pod' | null;
  recipient: FundingRecipient | null;
}

/**
 * Hook for managing funding modal state
 * Provides easy integration for pod and member funding across the app
 */
export function useFundingModal() {
  const [modalState, setModalState] = useState<FundingModalState>({
    isOpen: false,
    recipientType: null,
    recipient: null
  });

  const openFundingModal = useCallback((
    type: 'member' | 'pod',
    recipient: FundingRecipient
  ) => {
    setModalState({
      isOpen: true,
      recipientType: type,
      recipient
    });
  }, []);

  const closeFundingModal = useCallback(() => {
    setModalState({
      isOpen: false,
      recipientType: null,
      recipient: null
    });
  }, []);

  // Convenience methods for specific types
  const openMemberFunding = useCallback((member: FundingRecipient) => {
    openFundingModal('member', member);
  }, [openFundingModal]);

  const openPodFunding = useCallback((pod: FundingRecipient) => {
    openFundingModal('pod', pod);
  }, [openFundingModal]);

  return {
    // State
    isOpen: modalState.isOpen,
    recipientType: modalState.recipientType,
    recipient: modalState.recipient,
    
    // Actions
    openFundingModal,
    openMemberFunding,
    openPodFunding,
    closeFundingModal,
    
    // Modal props (ready to spread into FundingModal component)
    modalProps: {
      isOpen: modalState.isOpen,
      onClose: closeFundingModal,
      recipientType: modalState.recipientType,
      recipient: modalState.recipient
    }
  };
}