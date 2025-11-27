// src/app/features/forum/hooks/useTokenGate.ts
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import { useEligibility } from '../../pods/hooks/useEligibility';
import type { EligibilityCriteria } from '../../pods/services/EligibilityService';

interface TokenGateResult {
  hasAccess: boolean;
  isLoading: boolean;
  error: Error | null;
  checkAccess: () => Promise<boolean>;
  tokenBalances: {
    hasProofOfCuriosity: boolean;
    hasMarketAdmin: boolean;
    systemBalance: bigint;
    selfBalance: bigint;
  } | null;
  eligibilityResult?: any;
}

interface TokenGateOptions {
  eligibilityCriteria?: EligibilityCriteria[];
  podId?: string;
  roleId?: string;
  fallbackToTokenCheck?: boolean; // If true, falls back to traditional token check if no eligibility criteria
}

export function useTokenGate(options: TokenGateOptions = {}): TokenGateResult {
  const { address, isConnected } = useAccount();
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [tokenBalances, setTokenBalances] = useState<{
    hasProofOfCuriosity: boolean;
    hasMarketAdmin: boolean;
    systemBalance: bigint;
    selfBalance: bigint;
  } | null>(null);
  const [eligibilityResult, setEligibilityResult] = useState<any>(null);

  // Eligibility checking hook
  const eligibilityHook = useEligibility();
  
  const {
    eligibilityCriteria,
    podId,
    roleId,
    fallbackToTokenCheck = true
  } = options;

  const checkAccess = async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    if (!isConnected || !address) {
      setHasAccess(false);
      setTokenBalances(null);
      setEligibilityResult(null);
      setIsLoading(false);
      return false;
    }

    try {
      // Priority 1: Check eligibility criteria if provided
      if (eligibilityCriteria && eligibilityCriteria.length > 0) {
        const eligibilityCheck = await eligibilityHook.evaluateCriteria(
          eligibilityCriteria,
          podId,
          roleId
        );
        
        setEligibilityResult(eligibilityCheck);
        
        if (eligibilityCheck?.eligible) {
          setHasAccess(true);
          setIsLoading(false);
          console.log('✅ Forum access granted via eligibility criteria');
          return true;
        }
        
        // If eligibility check failed and no fallback allowed
        if (!fallbackToTokenCheck) {
          setHasAccess(false);
          setIsLoading(false);
          console.log('❌ Forum access denied via eligibility criteria');
          return false;
        }
      }
      
      // Priority 2: Role-based check if roleId provided
      if (roleId && podId) {
        try {
          const roleEligibilityCheck = await eligibilityHook.checkUserEligibility(podId, roleId);
          setEligibilityResult(roleEligibilityCheck);
          
          if (roleEligibilityCheck?.eligible) {
            setHasAccess(true);
            setIsLoading(false);
            console.log('✅ Forum access granted via role eligibility');
            return true;
          }
        } catch (roleError) {
          console.warn('Role eligibility check failed, falling back to token check:', roleError);
        }
      }
      
      // Fallback: Traditional token balance check
      if (fallbackToTokenCheck) {
        const balances = await fetchTokenBalances(address);
        setTokenBalances(balances);
        
        // Access is granted if user has Proof of Curiosity token
        const access = balances.hasProofOfCuriosity;
        setHasAccess(access);
        setIsLoading(false);
        console.log(access ? '✅ Forum access granted via token balance' : '❌ Forum access denied - no required tokens');
        return access;
      }
      
      // No valid access method found
      setHasAccess(false);
      setIsLoading(false);
      return false;
      
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error checking forum access'));
      setIsLoading(false);
      return false;
    }
  };

  // Verify access when wallet connects or criteria change
  useEffect(() => {
    if (isConnected && address) {
      checkAccess();
    } else {
      setHasAccess(false);
      setTokenBalances(null);
      setEligibilityResult(null);
      setIsLoading(false);
    }
  }, [isConnected, address, eligibilityCriteria, podId, roleId, fallbackToTokenCheck]);

  return {
    hasAccess,
    isLoading,
    error,
    checkAccess,
    tokenBalances,
    eligibilityResult
  };
}