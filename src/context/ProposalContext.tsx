// src/context/ProposalContext.tsx
'use client';
import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Address } from 'viem';

// Types
interface ProposalFormData {
  title: string;
  body: string;
  forumThreadId: string;
}

interface ProposalContextType {
  // Form state
  formData: ProposalFormData;
  setFormData: (data: ProposalFormData) => void;
  updateFormField: (field: keyof ProposalFormData, value: string) => void;
  resetForm: () => void;
  
  // Validation state
  canPropose: boolean;
  validationMessage: string;
  advocateBalance: bigint;
  
  // UI state
  isSubmitting: boolean;
  setIsSubmitting: (submitting: boolean) => void;
  
  // Form validation
  isFormValid: boolean;
  formErrors: string[];
}

const ProposalContext = createContext<ProposalContextType | null>(null);

// Hook to use the proposal context
export const useProposal = () => {
  const context = useContext(ProposalContext);
  if (!context) {
    throw new Error('useProposal must be used within a ProposalProvider');
  }
  return context;
};

// ABI for contract reads
const ADVOCATE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

interface ProposalProviderProps {
  children: ReactNode;
}

export const ProposalProvider: React.FC<ProposalProviderProps> = ({ children }) => {
  const { address, isConnected } = useAccount();
  
  // Form state
  const [formData, setFormData] = useState<ProposalFormData>({
    title: '',
    body: '',
    forumThreadId: '',
  });
  
  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check Advocate NFT balance
  const { data: advocateBalance = BigInt(0) } = useReadContract({
    address: process.env.NEXT_PUBLIC_ADVOCATE as Address,
    abi: ADVOCATE_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isConnected },
  });

  // Form field updater
  const updateFormField = useCallback((field: keyof ProposalFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Reset form
  const resetForm = useCallback(() => {
    setFormData({
      title: '',
      body: '',
      forumThreadId: '',
    });
  }, []);

  // Form validation
  const validateForm = useCallback(() => {
    const errors: string[] = [];

    if (!formData.title.trim()) {
      errors.push('Title is required');
    } else if (formData.title.length > 200) {
      errors.push('Title must be less than 200 characters');
    }

    if (!formData.body.trim()) {
      errors.push('Description is required');
    } else if (formData.body.length < 50) {
      errors.push('Description must be at least 50 characters');
    } else if (formData.body.length > 10000) {
      errors.push('Description must be less than 10,000 characters');
    }

    if (formData.forumThreadId && formData.forumThreadId.length > 100) {
      errors.push('Forum thread ID must be less than 100 characters');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }, [formData]);

  const { isValid: isFormValid, errors: formErrors } = validateForm();

  // User validation
  const getUserValidation = useCallback(() => {
    if (!isConnected || !address) {
      return {
        canPropose: false,
        message: 'Please connect your wallet to submit proposals',
      };
    }

    if (advocateBalance === BigInt(0)) {
      return {
        canPropose: false,
        message: 'You must hold an Advocate NFT to submit proposals',
      };
    }

    return {
      canPropose: true,
      message: 'Ready to submit proposals',
    };
  }, [isConnected, address, advocateBalance]);

  const { canPropose, message: validationMessage } = getUserValidation();

  const contextValue: ProposalContextType = {
    // Form state
    formData,
    setFormData,
    updateFormField,
    resetForm,
    
    // Validation state
    canPropose,
    validationMessage,
    advocateBalance,
    
    // UI state
    isSubmitting,
    setIsSubmitting,
    
    // Form validation
    isFormValid,
    formErrors,
  };

  return (
    <ProposalContext.Provider value={contextValue}>
      {children}
    </ProposalContext.Provider>
  );
};