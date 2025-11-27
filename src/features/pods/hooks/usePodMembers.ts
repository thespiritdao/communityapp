import { useQuery } from '@tanstack/react-query';
import { PodService } from '../services/PodService';
import type { MemberRef } from '../types';

export interface UsePodMembersOptions {
  membershipType?: 'leader' | 'member' | 'admin';
  enabled?: boolean;
  staleTime?: number;
  currentUserAddress?: string;
}

export interface UsePodMembersResult {
  members: string[];
  memberRefs: MemberRef[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to load pod members from pod_members table
 * Replaces runtime HAT scanning with efficient database lookup
 */
export function usePodMembers(
  podId: string,
  options: UsePodMembersOptions = {}
): UsePodMembersResult {
  const {
    membershipType,
    enabled = true,
    staleTime = 2 * 60 * 1000, // 2 minutes
    currentUserAddress
  } = options;

  const query = useQuery({
    queryKey: ['pod-members', podId, membershipType, currentUserAddress],
    queryFn: () => PodService.listPodMembers(podId, membershipType, currentUserAddress),
    enabled: enabled && !!podId,
    staleTime,
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    retry: 2,
    refetchOnWindowFocus: false,
  });

  const memberRefs = query.data || [];
  const members = memberRefs.map(ref => ref.wallet);

  return {
    members,
    memberRefs,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook to get pod member statistics
 */
export function usePodMemberStats(podId: string, enabled = true) {
  return useQuery({
    queryKey: ['pod-member-stats', podId],
    queryFn: () => PodService.getPodMemberStats(podId),
    enabled: enabled && !!podId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes cache
    retry: 2,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to check if current user is a member of a pod
 */
export function usePodMembership(podId: string, walletAddress: string, enabled = true) {
  return useQuery({
    queryKey: ['pod-membership', podId, walletAddress],
    queryFn: () => PodService.checkPodMembership(podId, walletAddress),
    enabled: enabled && !!podId && !!walletAddress,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes cache
    retry: 2,
    refetchOnWindowFocus: false,
  });
}