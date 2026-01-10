import { useState, useCallback } from 'react';
import { useEvmAddress, useSignEvmMessage, useCurrentUser } from '@coinbase/cdp-hooks';
import { useToast } from '@/components/ui/use-toast';
import { EventService } from '../../events/lib/supabase';
import {
  PodGovernanceService,
  type PodCreationData,
  type AccountabilitySignature,
} from '../services/podGovernanceService';
import { useManagerHatCreation } from './useHatPermissions';
import type { EligibilityCriteria } from '../services/EligibilityService';

// Interface matching the actual pods table structure
interface DatabasePod {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  token_address: string | null;
  treasury_address: string | null;
  status: string;
  parent_pod_id: string | null;
  pod_leads: string[];
  accountability_signatures: string;
  treasury_contract_address: string | null;
  management_hat_id: string | null;
  membership_hat_id: string | null;
  governance_proposal_id: string | null;
  created_by_address: string;
  pod_image_url: string;
  pod_metadata: string;
}

export interface UsePodCreationOptions {
  testingMode?: boolean;
}

export function usePodCreation(options: UsePodCreationOptions = {}) {
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { signEvmMessage } = useSignEvmMessage();
  const { toast } = useToast();
  const { createManagerHat } = useManagerHatCreation();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Sign accountability statement
   */
  const signAccountabilityStatement = useCallback(
    async (
      signerAddress: string,
      statement: string,
    ): Promise<AccountabilitySignature> => {
      try {
        if (!address) {
          throw new Error('Wallet not connected');
        }

        // Check if EVM account is available
        const evmAccount = currentUser?.evmAccounts?.[0];
        if (!evmAccount) {
          throw new Error('EVM account not available');
        }

        const message = `SpiritDAO Pod Leadership Accountability Statement\n\nAddress: ${signerAddress}\nTimestamp: ${new Date().toISOString()}\n\n${statement}`;

        // Sign with CDP
        const signResult = await signEvmMessage({
          evmAccount: evmAccount as `0x${string}`,
          message,
        });
        const signature = signResult.signature;

        return {
          address: signerAddress,
          signature,
          timestamp: new Date().toISOString(),
          statement,
          isValid: true,
        };
      } catch (error) {
        console.error('Failed to sign accountability statement:', error);
        throw error;
      }
    },
    [address, config],
  );

  /**
   * Create and submit pod proposal
   */
  const createPodProposal = useCallback(
    async (podData: {
      name: string;
      description: string;
      parentPodId: string;
      podLeads: string[];
      accountabilitySignatures: Record<string, AccountabilitySignature>;
      image?: string;
      podImage?: File | null;
      podImageUrl?: string;
      leaderEligibilityCriteria?: EligibilityCriteria[];
      memberEligibilityCriteria?: EligibilityCriteria[];
    }) => {
      try {
        setLoading(true);
        setError(null);

        if (!address) {
          throw new Error('Wallet not connected');
        }

        // Generate unique pod ID
        const podId = `pod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Upload pod image if provided, otherwise use default
        let podImageUrl =
          podData.image ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(podData.name)}&size=400&background=bfe7c6&color=000&bold=true`;

        if (podData.podImage) {
          console.log('📸 Uploading pod image to storage...');
          const { uploadPodImage } = await import(
            '../services/podImageUploadService'
          );

          const uploadResult = await uploadPodImage(podData.podImage, podId);

          if (uploadResult.success && uploadResult.url) {
            podImageUrl = uploadResult.url;
            console.log('✅ Pod image uploaded:', podImageUrl);
          } else {
            console.warn(
              '⚠️ Image upload failed, using default:',
              uploadResult.error,
            );

            // Notify user that image upload failed
            toast({
              title: 'Image Upload Failed',
              description: `${uploadResult.error || 'Unknown error'}. Pod will use a default avatar instead.`,
              variant: 'destructive',
            });

            // Don't fail pod creation, just use default image
          }
        } else {
          console.log('ℹ️ No image provided, using default avatar');
        }

        // Get parent pod info to extract HAT ID
        const availablePods = (await EventService.getPods()) as DatabasePod[];
        const parentPod = availablePods.find(
          (pod) => pod.id === podData.parentPodId,
        );

        if (!parentPod || !parentPod.management_hat_id) {
          throw new Error('Invalid parent pod or missing HAT ID');
        }

        // NOTE: Manager HAT will be created AFTER proxy admin HAT setup
        // This ensures the manager HAT has the proxy admin HAT as its admin
        let managerHatId: string | null = null;

        // Prepare complete pod data (HAT IDs will be set after proxy admin HAT setup)
        const completePodData: PodCreationData = {
          id: podId,
          name: podData.name,
          description: podData.description,
          parent_pod_id: podData.parentPodId || null,
          parent_hat_id: parentPod.management_hat_id, // ✅ NEW: Direct field for efficient child index queries
          pod_leads: podData.podLeads.filter((lead) => lead.trim()),
          accountability_signatures: podData.accountabilitySignatures,
          created_by_address: address,
          pod_image_url: podImageUrl,
          pod_metadata: {
            created_at: new Date().toISOString(),
            created_by: address,
            testing_mode: options.testingMode || false,
            version: '2.0', // v2 with proxy admin HAT pattern
            parent_hat_id: parentPod.management_hat_id, // Store parent HAT ID for contract call (backwards compatibility)
            manager_hat_id: null, // Will be set after HAT creation
          },
          status: 'draft',
          is_active: false,
          management_hat_id: undefined, // Will be set after HAT creation
          membership_hat_id: undefined, // Will be set after HAT creation
          leaderEligibilityCriteria: podData.leaderEligibilityCriteria || [],
          memberEligibilityCriteria: podData.memberEligibilityCriteria || [],
        };

        // REMOVED: PodCreationManager contract call (obsolete with proxy admin HAT pattern)
        // Pods are now created by:
        // 1. Creating proxy contract via PodAuthorizationFactory
        // 2. Creating HATs via Hats Protocol directly
        // 3. Storing metadata in database

        console.log(
          '💾 Creating pod in database (no PodCreationManager needed)...',
        );

        // Create pod in database first
        const result =
          await PodGovernanceService.createPodProposal(completePodData);

        console.log('✅ Pod created in database successfully');
        console.log('ℹ️ Pod ID:', podId);
        console.log(
          'ℹ️ Next steps: Admin can configure HATs and proxy via pod management dashboard',
        );

        // SIMPLIFIED: Removed all contract calls to avoid Coinbase Smart Wallet gas estimation issues
        // Pod is created in database with status='draft'
        // Admin can later:
        // 1. Navigate to /pods/create-with-modules to create HATs via OnchainKit Transaction component
        // 2. Set up proxy contracts via pod management panel
        // 3. Activate pod when ready

        /* LEGACY CODE DELETED: Old writeContract() implementation (212 lines) removed.
         * Caused gas estimation errors with Coinbase Smart Wallets.
         * Replaced by /pods/create-with-modules using OnchainKit Transaction components.
         */

        // Generate and submit governance proposal (database-only, no contract submission)
        const proposalData =
          await PodGovernanceService.generatePodApprovalProposal(
            completePodData,
            availablePods as any,
          );

        console.log('✅ Pod proposal generated:', {
          podId,
          proposalTitle: proposalData.title,
          status: 'draft',
          note: 'HATs and proxy can be set up via /pods/create-with-modules',
        });

        toast({
          title: 'Pod Initialized Successfully',
          description: `Pod "${podData.name}" created. Redirecting to complete blockchain setup...`,
        });

        // ===================================================================
        // CRITICAL FIX: Redirect to HatsModulePodCreationForm for blockchain setup
        // ===================================================================
        // The blockchain setup (proxy, HATs, factory registration) must be done
        // via OnchainKit Transaction component to support Coinbase Smart Wallets.
        // usePodCreation used to have this logic (lines 189-400) but it was
        // commented out due to gas estimation errors with writeContract().
        //
        // Solution: Redirect to /pods/create-with-modules which uses OnchainKit
        // Transaction component (proper smart wallet support).
        if (typeof window !== 'undefined') {
          // Delay redirect slightly so toast is visible
          setTimeout(() => {
            window.location.href = `/pods/create-with-modules?podId=${podId}`;
          }, 1500);
        }

        return {
          podId,
          proposal: proposalData,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to create pod';
        setError(errorMessage);

        toast({
          title: 'Pod Creation Failed',
          description: errorMessage,
          variant: 'destructive',
        });

        throw error;
      } finally {
        setLoading(false);
      }
    },
    [address, options.testingMode, toast],
  );

  /**
   * Get pod creation status
   */
  const getPodStatus = useCallback(async (podId: string) => {
    try {
      const pod = await PodGovernanceService.getPodProposal(podId);
      return pod;
    } catch (error) {
      console.error('Failed to get pod status:', error);
      return null;
    }
  }, []);

  /**
   * List user's pods
   */
  const getUserPods = useCallback(async () => {
    try {
      if (!address) return [];

      const allPods = (await PodGovernanceService.getPods()) as DatabasePod[];

      // Filter pods where user is a lead or creator
      return allPods.filter(
        (pod) =>
          pod.created_by_address?.toLowerCase() === address.toLowerCase() ||
          (pod.pod_leads &&
            pod.pod_leads.some(
              (lead: string) => lead.toLowerCase() === address.toLowerCase(),
            )),
      );
    } catch (error) {
      console.error('Failed to get user pods:', error);
      return [];
    }
  }, [address]);

  return {
    // State
    loading,
    error,

    // Methods
    signAccountabilityStatement,
    createPodProposal,
    getPodStatus,
    getUserPods,
  };
}
