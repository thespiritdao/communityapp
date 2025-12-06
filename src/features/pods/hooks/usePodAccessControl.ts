// src/features/pods/hooks/usePodAccessControl.ts

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useRouter } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import { HatCreationService } from '../services/HatCreationService';
import { publicClient } from '@/config/wagmi.client';

interface AccessControlResult {
  hasAccess: boolean;
  isLoading: boolean;
  isExecutiveMember: boolean;
  isPodLeader: boolean;
  isPodMember: boolean;
  redirectPath?: string;
  errorMessage?: string;
}

interface AccessControlOptions {
  requireExecutive?: boolean;
  requirePodLeader?: string; // Pod ID to check leadership
  requirePodMember?: string; // Pod ID to check membership
  requireHat?: string; // Hat ID to check
  redirectTo?: string; // Where to redirect if no access
  allowPublic?: boolean; // Allow public access
}

export function usePodAccessControl(
  options: AccessControlOptions = {},
): AccessControlResult {
  const { address } = useAccount();
  const router = useRouter();

  const [accessState, setAccessState] = useState<AccessControlResult>({
    hasAccess: false,
    isLoading: true,
    isExecutiveMember: false,
    isPodLeader: false,
    isPodMember: false,
  });

  useEffect(() => {
    const checkAccess = async () => {
      // If public access is allowed and no specific requirements, grant access
      if (
        options.allowPublic &&
        !options.requireExecutive &&
        !options.requirePodLeader &&
        !options.requirePodMember &&
        !options.requireHat
      ) {
        setAccessState({
          hasAccess: true,
          isLoading: false,
          isExecutiveMember: false,
          isPodLeader: false,
          isPodMember: false,
        });
        return;
      }

      // No wallet connected - deny access unless public
      if (!address) {
        setAccessState({
          hasAccess: options.allowPublic || false,
          isLoading: false,
          isExecutiveMember: false,
          isPodLeader: false,
          isPodMember: false,
          errorMessage: 'Please connect your wallet to access this page',
        });

        if (!options.allowPublic && options.redirectTo) {
          router.push(options.redirectTo);
        }
        return;
      }

      try {
        let hasRequiredAccess = true;
        let isExecutiveMember = false;
        let isPodLeader = false;
        let isPodMember = false;
        let errorMessage: string | undefined;

        // Check Executive Pod membership
        if (options.requireExecutive) {
          const { data: executivePod } = await supabase
            .from('pods')
            .select('membership_hat_id, pod_leads')
            .eq('name', 'Executive Pod')
            .single();

          if (executivePod) {
            // Check if user is a pod lead
            isExecutiveMember =
              executivePod.pod_leads?.some(
                (lead: string) => lead.toLowerCase() === address.toLowerCase(),
              ) || false;

            // If not a lead, check Hat ownership
            if (!isExecutiveMember && executivePod.membership_hat_id) {
              try {
                const hatBalance = await HatCreationService.checkHatOwnership(
                  publicClient,
                  executivePod.membership_hat_id,
                  address,
                );
                isExecutiveMember = hatBalance;
              } catch (error) {
                console.error('Error checking Executive Hat:', error);
              }
            }

            if (!isExecutiveMember) {
              hasRequiredAccess = false;
              errorMessage = 'Executive Pod membership required';
            }
          } else {
            hasRequiredAccess = false;
            errorMessage = 'Executive Pod not found';
          }
        }

        // Check Pod Leadership
        if (options.requirePodLeader && hasRequiredAccess) {
          const { data: pod } = await supabase
            .from('pods')
            .select('pod_leads, management_hat_id')
            .eq('id', options.requirePodLeader)
            .single();

          if (pod) {
            // Check if user is in pod_leads array
            isPodLeader =
              pod.pod_leads?.some(
                (lead: string) => lead.toLowerCase() === address.toLowerCase(),
              ) || false;

            // If not in leads array, check management Hat
            if (!isPodLeader && pod.management_hat_id) {
              try {
                const hatBalance = await HatCreationService.checkHatOwnership(
                  publicClient,
                  pod.management_hat_id,
                  address,
                );
                isPodLeader = hatBalance;
              } catch (error) {
                console.error('Error checking Management Hat:', error);
              }
            }

            if (!isPodLeader) {
              hasRequiredAccess = false;
              errorMessage = 'Pod leadership required';
            }
          } else {
            hasRequiredAccess = false;
            errorMessage = 'Pod not found';
          }
        }

        // Check Pod Membership
        if (options.requirePodMember && hasRequiredAccess) {
          // First check pod_members table
          const { data: membership } = await supabase
            .from('pod_members')
            .select('role')
            .eq('pod_id', options.requirePodMember)
            .eq('wallet_address', address.toLowerCase())
            .single();

          isPodMember = !!membership;

          // If not in members table, check membership Hat
          if (!isPodMember) {
            const { data: pod } = await supabase
              .from('pods')
              .select('membership_hat_id')
              .eq('id', options.requirePodMember)
              .single();

            if (pod?.membership_hat_id) {
              try {
                const hatBalance = await HatCreationService.checkHatOwnership(
                  publicClient,
                  pod.membership_hat_id,
                  address,
                );
                isPodMember = hatBalance;
              } catch (error) {
                console.error('Error checking Membership Hat:', error);
              }
            }
          }

          if (!isPodMember) {
            hasRequiredAccess = false;
            errorMessage = 'Pod membership required';
          }
        }

        // Check specific Hat ownership
        if (options.requireHat && hasRequiredAccess) {
          try {
            const hasHat = await HatCreationService.checkHatOwnership(
              publicClient,
              options.requireHat,
              address,
            );

            if (!hasHat) {
              hasRequiredAccess = false;
              errorMessage = 'Required Hat not owned';
            }
          } catch (error) {
            console.error('Error checking Hat ownership:', error);
            hasRequiredAccess = false;
            errorMessage = 'Failed to verify Hat ownership';
          }
        }

        setAccessState({
          hasAccess: hasRequiredAccess,
          isLoading: false,
          isExecutiveMember,
          isPodLeader,
          isPodMember,
          errorMessage,
        });

        // Redirect if access denied
        if (!hasRequiredAccess && options.redirectTo) {
          router.push(options.redirectTo);
        }
      } catch (error) {
        console.error('Access control check failed:', error);
        setAccessState({
          hasAccess: false,
          isLoading: false,
          isExecutiveMember: false,
          isPodLeader: false,
          isPodMember: false,
          errorMessage: 'Failed to verify access permissions',
        });

        if (options.redirectTo) {
          router.push(options.redirectTo);
        }
      }
    };

    checkAccess();
  }, [
    address,
    options.requireExecutive,
    options.requirePodLeader,
    options.requirePodMember,
    options.requireHat,
  ]);

  return accessState;
}

// Helper hook for Executive Pod access
export function useExecutivePodAccess(redirectTo = '/pods') {
  return usePodAccessControl({
    requireExecutive: true,
    redirectTo,
  });
}

// Helper hook for Pod Leader access
export function usePodLeaderAccess(podId: string, redirectTo = '/pods') {
  return usePodAccessControl({
    requirePodLeader: podId,
    redirectTo,
  });
}

// Helper hook for Pod Member access
export function usePodMemberAccess(podId: string, redirectTo = '/pods') {
  return usePodAccessControl({
    requirePodMember: podId,
    redirectTo,
  });
}
