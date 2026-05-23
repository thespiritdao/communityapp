/**
 * Pod Management State - Optimized state management with memoization
 *
 * Centralizes pod management state with proper memoization to prevent
 * unnecessary re-renders and improve performance.
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { usePodMembers } from './usePodMembers';
import { PodService } from '../services/PodService';
import { useQuery } from '@tanstack/react-query';
import { useHybridPodPermission } from '@/hooks/useHybridPodPermission';
import type { MemberRef } from '../types';

interface UsePodManagementStateProps {
  podId: string;
  userAddress?: string;
  initialTab?: string;
}

interface PodManagementState {
  // Pod data
  pod: any | null;
  isLoadingPod: boolean;
  podError: Error | null;

  // Member data
  leaders: string[];
  members: string[];
  memberRefs: MemberRef[]; // ✅ ISSUE #7: Full member data for removal flow
  isLoadingMembers: boolean;
  membersError: Error | null;

  // User capabilities
  canManageMembers: boolean;
  canManageTreasury: boolean;
  canEditPod: boolean;
  // Granular per-feature permissions — surface tabs to non-leader role
  // holders. canManageMembers is "is leader-ish"; these are the
  // capability-specific flags.
  canManagePasswords: boolean;
  canViewTreasury: boolean;
  canManageAgent: boolean;
  canManageSurveys: boolean;

  // UI state
  selectedTab: string;
  setSelectedTab: (tab: string) => void;

  // Refresh functions
  refetchPod: () => void;
  refetchMembers: () => void;
}

/**
 * Centralized hook for pod management state with optimized queries
 */
export function usePodManagementState({
  podId,
  userAddress,
  initialTab,
}: UsePodManagementStateProps): PodManagementState {
  const [selectedTab, setSelectedTab] = useState(initialTab || 'members');

  // 🔍 DEBUG: Log inputs to hook
  console.log('🎯 usePodManagementState called with:', { podId, userAddress });

  // Pod data query with caching
  const {
    data: pod,
    isLoading: isLoadingPod,
    error: podError,
    refetch: refetchPod,
  } = useQuery({
    queryKey: ['pod', podId],
    queryFn: () => PodService.getPodById(podId),
    enabled: !!podId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
    refetchOnWindowFocus: false,
  });

  // Fetch leader HAT holders from active_pod_members
  const {
    members: leaderHatHolders,
    isLoading: isLoadingLeaderHats,
  } = usePodMembers(podId, {
    membershipType: 'leader',
    enabled: !!podId,
    staleTime: 2 * 60 * 1000,
    currentUserAddress: userAddress,
  });

  // Leaders data - combine pod_leads array with leader HAT holders
  const leaders = useMemo(() => {
    const podLeads = pod?.pod_leads || [];
    const leaderHats = leaderHatHolders || [];

    // Normalize addresses to lowercase for proper deduplication
    // pod_leads stores checksummed addresses, pod_members stores lowercase
    const normalizedPodLeads = podLeads.map((addr) => addr.toLowerCase());
    const normalizedLeaderHats = leaderHats.map((addr) => addr.toLowerCase());

    // Combine and deduplicate
    const combined = Array.from(new Set([...normalizedPodLeads, ...normalizedLeaderHats]));

    console.log('👑 Leaders calculation:', {
      podLeads,
      leaderHatHolders: leaderHats,
      combined,
    });

    return combined;
  }, [pod?.pod_leads, leaderHatHolders]);

  // Members data using the optimized hook
  const {
    members: memberAddresses,
    memberRefs, // ✅ ISSUE #7: Get full member data for removal flow
    isLoading: isLoadingMembers,
    error: membersError,
    refetch: refetchMembers,
  } = usePodMembers(podId, {
    membershipType: 'member',
    enabled: !!podId,
    staleTime: 2 * 60 * 1000, // 2 minutes for member data
    currentUserAddress: userAddress,
  });

  // 🔐 HYBRID PERMISSION CHECKS - On-chain HAT verification + Database permissions
  // These hooks verify BOTH that user holds HAT on-chain AND has database permissions
  console.log('🔐 Checking hybrid permissions for:', { podId, userAddress });

  const {
    hasPermission: canManageMembers,
    isLoading: manageMembersLoading,
    error: manageMembersError,
  } = useHybridPodPermission(podId, 'memberManagement');

  const {
    hasPermission: canManageTreasuryPermission,
    isLoading: manageTreasuryLoading,
    error: manageTreasuryError,
  } = useHybridPodPermission(podId, 'treasuryManagement');

  const {
    hasPermission: canManagePasswords,
  } = useHybridPodPermission(podId, 'passwordsManage');

  const {
    hasPermission: canViewTreasury,
  } = useHybridPodPermission(podId, 'treasuryViewing');

  const {
    hasPermission: canManageAgent,
  } = useHybridPodPermission(podId, 'agentManage');

  const {
    hasPermission: canManageSurveys,
  } = useHybridPodPermission(podId, 'surveyManage');

  // Show treasury tab if user has treasuryManagement permission
  // Users need to see the tab to CREATE a treasury (don't require it to exist first)
  const canManageTreasury = useMemo(() => {
    const hasTreasuryContract = !!pod?.treasury_contract_address;

    console.log('🏦 Treasury access check:', {
      canManageTreasuryPermission,
      hasTreasuryContract,
      treasury_contract_address: pod?.treasury_contract_address,
      finalDecision: canManageTreasuryPermission,
    });

    return canManageTreasuryPermission;
  }, [canManageTreasuryPermission]);

  // Edit pod = same as manage members (leaders can edit)
  const canEditPod = canManageMembers;

  // Log final capabilities for debugging
  console.log('🎯 Final hybrid capabilities:', {
    canManageMembers,
    canManageTreasury,
    canEditPod,
    isLoading: manageMembersLoading || manageTreasuryLoading,
  });

  // Memoized tab setter to prevent unnecessary re-renders
  const memoizedSetSelectedTab = useCallback((tab: string) => {
    setSelectedTab(tab);
  }, []);

  // Return memoized state object
  return useMemo(
    () => ({
      // Pod data
      pod,
      isLoadingPod,
      podError: podError as Error | null,

      // Member data
      leaders,
      members: memberAddresses,
      memberRefs, // ✅ ISSUE #7: Full member data for removal flow
      isLoadingMembers: isLoadingMembers || isLoadingLeaderHats,
      membersError: membersError as Error | null,

      // User capabilities
      canManageMembers,
      canManageTreasury,
      canEditPod,
      canManagePasswords,
      canViewTreasury,
      canManageAgent,
      canManageSurveys,

      // UI state
      selectedTab,
      setSelectedTab: memoizedSetSelectedTab,

      // Refresh functions
      refetchPod,
      refetchMembers,
    }),
    [
      pod,
      isLoadingPod,
      podError,
      leaders,
      memberAddresses,
      memberRefs, // ✅ ISSUE #7: Add to dependencies
      isLoadingMembers,
      isLoadingLeaderHats,
      membersError,
      canManageMembers,
      canManageTreasury,
      canEditPod,
      canManagePasswords,
      canViewTreasury,
      canManageAgent,
      canManageSurveys,
      selectedTab,
      memoizedSetSelectedTab,
      refetchPod,
      refetchMembers,
    ],
  );
}
