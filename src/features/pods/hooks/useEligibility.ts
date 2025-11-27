'use client';

import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useToast } from '@/components/ui/use-toast';
import { EligibilityApiClient } from '../services/EligibilityApiClient';
import type { EligibilityCriteria, EligibilityEvaluation } from '../services/EligibilityService';
import type { 
  EligibilityCheckResponse, 
  EligibleRolesResponse, 
  RoleEligibilityResponse 
} from '../services/EligibilityApiClient';

interface UseEligibilityState {
  loading: boolean;
  error: string | null;
  lastChecked: Date | null;
}

export function useEligibility() {
  const { address } = useAccount();
  const { toast } = useToast();
  
  const [state, setState] = useState<UseEligibilityState>({
    loading: false,
    error: null,
    lastChecked: null
  });

  const updateState = useCallback((updates: Partial<UseEligibilityState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const handleError = useCallback((error: Error, title: string) => {
    console.error(title, error);
    updateState({ error: error.message, loading: false });
    toast({
      title,
      description: error.message,
      variant: 'destructive'
    });
  }, [toast, updateState]);

  /**
   * Check if the current user is eligible for a specific role
   */
  const checkUserEligibility = useCallback(async (
    podId: string,
    roleId: string
  ): Promise<EligibilityCheckResponse | null> => {
    if (!address) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to check eligibility",
        variant: "destructive"
      });
      return null;
    }

    updateState({ loading: true, error: null });

    try {
      const result = await EligibilityApiClient.checkUserEligibility(podId, address, roleId);
      updateState({ loading: false, lastChecked: new Date() });
      return result;
    } catch (error) {
      handleError(error as Error, "Eligibility Check Failed");
      return null;
    }
  }, [address, toast, updateState, handleError]);

  /**
   * Get all eligible roles for the current user in a pod
   */
  const getEligibleRoles = useCallback(async (
    podId: string
  ): Promise<EligibleRolesResponse | null> => {
    if (!address) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to check eligible roles",
        variant: "destructive"
      });
      return null;
    }

    updateState({ loading: true, error: null });

    try {
      const result = await EligibilityApiClient.getEligibleRoles(podId, address);
      updateState({ loading: false, lastChecked: new Date() });
      return result;
    } catch (error) {
      handleError(error as Error, "Failed to Get Eligible Roles");
      return null;
    }
  }, [address, toast, updateState, handleError]);

  /**
   * Evaluate custom criteria against the current user
   */
  const evaluateCriteria = useCallback(async (
    criteria: EligibilityCriteria[],
    podId?: string,
    roleId?: string
  ): Promise<EligibilityEvaluation | null> => {
    if (!address) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to evaluate criteria",
        variant: "destructive"
      });
      return null;
    }

    updateState({ loading: true, error: null });

    try {
      const result = await EligibilityApiClient.evaluateCriteria(address, criteria, podId, roleId);
      updateState({ loading: false, lastChecked: new Date() });
      return result.evaluation;
    } catch (error) {
      handleError(error as Error, "Criteria Evaluation Failed");
      return null;
    }
  }, [address, toast, updateState, handleError]);

  /**
   * Get role eligibility information
   */
  const getRoleEligibility = useCallback(async (
    roleId: string,
    includeUserStatus = true
  ): Promise<RoleEligibilityResponse | null> => {
    updateState({ loading: true, error: null });

    try {
      const userAddress = includeUserStatus ? address : undefined;
      const result = await EligibilityApiClient.getRoleEligibility(roleId, userAddress);
      updateState({ loading: false, lastChecked: new Date() });
      return result;
    } catch (error) {
      handleError(error as Error, "Failed to Get Role Eligibility");
      return null;
    }
  }, [address, updateState, handleError]);

  /**
   * Update eligibility criteria for a role
   */
  const updateRoleEligibility = useCallback(async (
    roleId: string,
    eligibilityCriteria: EligibilityCriteria[]
  ): Promise<boolean> => {
    if (!address) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to update eligibility criteria",
        variant: "destructive"
      });
      return false;
    }

    // Validate criteria before sending
    const validation = EligibilityApiClient.validateCriteria(eligibilityCriteria);
    if (!validation.valid) {
      toast({
        title: "Invalid Criteria",
        description: validation.errors[0],
        variant: "destructive"
      });
      return false;
    }

    updateState({ loading: true, error: null });

    try {
      await EligibilityApiClient.updateRoleEligibility(roleId, eligibilityCriteria, address);
      updateState({ loading: false, lastChecked: new Date() });
      
      toast({
        title: "Eligibility Updated",
        description: "Role eligibility criteria have been updated successfully"
      });
      
      return true;
    } catch (error) {
      handleError(error as Error, "Failed to Update Eligibility");
      return false;
    }
  }, [address, toast, updateState, handleError]);

  /**
   * Preview eligibility for current user without saving
   */
  const previewEligibility = useCallback(async (
    criteria: EligibilityCriteria[]
  ): Promise<EligibilityEvaluation | null> => {
    if (!address) return null;

    updateState({ loading: true, error: null });

    try {
      const result = await EligibilityApiClient.previewEligibility(address, criteria);
      updateState({ loading: false });
      return result;
    } catch (error) {
      handleError(error as Error, "Preview Failed");
      return null;
    }
  }, [address, updateState, handleError]);

  /**
   * Auto-assign eligible roles to current user
   */
  const autoAssignEligibleRoles = useCallback(async (
    podId: string
  ): Promise<string[]> => {
    if (!address) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to auto-assign roles",
        variant: "destructive"
      });
      return [];
    }

    updateState({ loading: true, error: null });

    try {
      const assignedRoles = await EligibilityApiClient.autoAssignEligibleRoles(podId, address);
      updateState({ loading: false, lastChecked: new Date() });
      
      if (assignedRoles.length > 0) {
        toast({
          title: "Roles Assigned",
          description: `You have been assigned ${assignedRoles.length} eligible role(s)`
        });
      }
      
      return assignedRoles;
    } catch (error) {
      handleError(error as Error, "Auto-Assignment Failed");
      return [];
    }
  }, [address, toast, updateState, handleError]);

  /**
   * Validate criteria without evaluating
   */
  const validateCriteria = useCallback((criteria: EligibilityCriteria[]) => {
    return EligibilityApiClient.validateCriteria(criteria);
  }, []);

  return {
    // State
    loading: state.loading,
    error: state.error,
    lastChecked: state.lastChecked,
    userAddress: address,
    
    // Actions
    checkUserEligibility,
    getEligibleRoles,
    evaluateCriteria,
    getRoleEligibility,
    updateRoleEligibility,
    previewEligibility,
    autoAssignEligibleRoles,
    validateCriteria,
    
    // Utils
    clearError: () => updateState({ error: null }),
    refresh: () => updateState({ lastChecked: null })
  };
}

/**
 * Hook for managing eligibility criteria in forms
 */
export function useEligibilityCriteria(initialCriteria: EligibilityCriteria[] = []) {
  const [criteria, setCriteria] = useState<EligibilityCriteria[]>(initialCriteria);
  const [hasChanges, setHasChanges] = useState(false);
  
  const updateCriteria = useCallback((newCriteria: EligibilityCriteria[]) => {
    setCriteria(newCriteria);
    setHasChanges(true);
  }, []);

  const addCriterion = useCallback((criterion: EligibilityCriteria) => {
    setCriteria(prev => [...prev, criterion]);
    setHasChanges(true);
  }, []);

  const removeCriterion = useCallback((index: number) => {
    setCriteria(prev => prev.filter((_, i) => i !== index));
    setHasChanges(true);
  }, []);

  const updateCriterion = useCallback((index: number, updates: Partial<EligibilityCriteria>) => {
    setCriteria(prev => prev.map((criterion, i) => 
      i === index ? { ...criterion, ...updates } : criterion
    ));
    setHasChanges(true);
  }, []);

  const reset = useCallback((newCriteria?: EligibilityCriteria[]) => {
    setCriteria(newCriteria || initialCriteria);
    setHasChanges(false);
  }, [initialCriteria]);

  const validate = useCallback(() => {
    return EligibilityApiClient.validateCriteria(criteria);
  }, [criteria]);

  return {
    criteria,
    hasChanges,
    updateCriteria,
    addCriterion,
    removeCriterion,
    updateCriterion,
    reset,
    validate,
    setCriteria,
    markSaved: () => setHasChanges(false)
  };
}