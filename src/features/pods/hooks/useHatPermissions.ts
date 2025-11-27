import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { HATS_CONFIG, POD_TO_LEADER_HAT } from '../utils/podLeaderHats';
import { logHatTransaction, logHatError } from '../services/hatErrorService';
import { getHatsCoreService } from '../../../services/hatsCoreService';
import type { Pod } from '../../events/types/event';

// Enhanced HATS ABI for comprehensive checking
const HATS_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'hatId', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'isWearerOfHat',
    type: 'function',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'hatId', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  {
    name: 'isActive',
    type: 'function',
    inputs: [{ name: 'hatId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  {
    name: 'getHatStatus',
    type: 'function',
    inputs: [{ name: 'hatId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  {
    name: 'createHat',
    type: 'function',
    inputs: [
      { name: 'admin', type: 'uint256' },
      { name: 'details', type: 'string' },
      { name: 'maxSupply', type: 'uint32' },
      { name: 'eligibility', type: 'address' },
      { name: 'toggle', type: 'address' },
      { name: 'mutable', type: 'bool' },
      { name: 'imageURI', type: 'string' }
    ],
    outputs: [{ name: 'newHatId', type: 'uint256' }],
    stateMutability: 'nonpayable'
  }
] as const;

interface HatPermissions {
  canManage: Record<string, boolean>; // podId -> can manage
  managedPods: Pod[];
  loading: boolean;
  error: string | null;
}

export function useHatPermissions(allPods: Pod[]): HatPermissions {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  
  const [permissions, setPermissions] = useState<{
    canManage: Record<string, boolean>;
    loading: boolean;
    error: string | null;
  }>({
    canManage: {},
    loading: true,
    error: null
  });

  const checkHatPermissions = useCallback(async (userAddress: string, hatId: string): Promise<{
    hasHat: boolean;
    isActive: boolean;
    canManage: boolean;
    error?: string;
  }> => {
    const startTime = Date.now();
    
    try {
      if (!publicClient) {
        const error = 'No public client available';
        logHatError(new Error(error), {
          userAddress,
          hatId,
          action: 'check_permissions'
        });
        return { hasHat: false, isActive: false, canManage: false, error };
      }
      
      console.log(`🎩 Checking comprehensive HAT permissions for ${hatId}...`);
      
      // Check if user is wearing the hat (more reliable than balance check)
      const isWearerResult = await publicClient.readContract({
        address: HATS_CONFIG.CONTRACT_ADDRESS,
        abi: HATS_ABI,
        functionName: 'isWearerOfHat',
        args: [userAddress as `0x${string}`, BigInt(hatId)]
      }).catch((err) => {
        console.warn(`🎩 isWearerOfHat not available for ${hatId}, falling back to balanceOf:`, err.message);
        return null;
      });
      
      // Fallback to balance check if isWearerOfHat not available
      const balanceResult = isWearerResult === null ? await publicClient.readContract({
        address: HATS_CONFIG.CONTRACT_ADDRESS,
        abi: HATS_ABI,
        functionName: 'balanceOf',
        args: [userAddress as `0x${string}`, BigInt(hatId)]
      }).catch((err) => {
        console.warn(`🎩 balanceOf failed for ${hatId}:`, err.message);
        return BigInt(0);
      }) : null;
      
      const hasHat = isWearerResult !== null ? Boolean(isWearerResult) : Number(balanceResult) > 0;
      
      // Check if the hat is active (not toggled off)
      const isActiveResult = await publicClient.readContract({
        address: HATS_CONFIG.CONTRACT_ADDRESS,
        abi: HATS_ABI,
        functionName: 'isActive',
        args: [BigInt(hatId)]
      }).catch((err) => {
        console.warn(`🎩 isActive not available for ${hatId}, falling back to getHatStatus:`, err.message);
        return null;
      });
      
      // Fallback to getHatStatus if isActive not available
      const statusResult = isActiveResult === null ? await publicClient.readContract({
        address: HATS_CONFIG.CONTRACT_ADDRESS,
        abi: HATS_ABI,
        functionName: 'getHatStatus',
        args: [BigInt(hatId)]
      }).catch((err) => {
        console.warn(`🎩 getHatStatus failed for ${hatId}, defaulting to true:`, err.message);
        return true;
      }) : null;
      
      const isActive = isActiveResult !== null ? Boolean(isActiveResult) : Boolean(statusResult);
      const canManage = hasHat && isActive;
      
      const duration = Date.now() - startTime;
      
      // Log successful permission check
      logHatTransaction({
        type: 'permission_check',
        action: 'check_hat_permissions',
        success: true,
        duration,
        hatId,
        userAddress,
        details: {
          hasHat,
          isActive,
          canManage,
          checkMethod: isWearerResult !== null ? 'isWearerOfHat' : 'balanceOf',
          activeCheckMethod: isActiveResult !== null ? 'isActive' : 'getHatStatus'
        }
      });
      
      console.log(`🎩 HAT ${hatId} permissions:`, {
        userAddress: userAddress.slice(0, 8) + '...',
        hasHat,
        isActive,
        canManage,
        checkMethod: isWearerResult !== null ? 'isWearerOfHat' : 'balanceOf',
        duration: `${duration}ms`
      });
      
      return { hasHat, isActive, canManage };
    } catch (error) {
      const duration = Date.now() - startTime;
      const parsedError = logHatError(error, {
        userAddress,
        hatId,
        action: 'check_permissions'
      });
      
      // Also log failed transaction
      logHatTransaction({
        type: 'permission_check',
        action: 'check_hat_permissions',
        success: false,
        duration,
        hatId,
        userAddress,
        details: { error: parsedError.message }
      });
      
      return { hasHat: false, isActive: false, canManage: false, error: parsedError.message };
    }
  }, [publicClient]);

  const checkAllPermissions = useCallback(async () => {
    if (!address || !publicClient || !allPods || allPods.length === 0) {
      setPermissions(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      setPermissions(prev => ({ ...prev, loading: true, error: null }));
      
      console.log('🎩 Checking HAT permissions for user:', address);
      console.log('🎩 Available pods to check:', allPods.length);

      const canManage: Record<string, boolean> = {};

      // Check permissions for each pod
      await Promise.all(
        allPods.map(async (pod) => {
          try {
            // Check if user has the pod's leadership HAT
            const leaderHatId = POD_TO_LEADER_HAT[pod.id];
            const leaderPermissions = leaderHatId 
              ? await checkHatPermissions(address, leaderHatId)
              : { hasHat: false, isActive: false, canManage: false };

            // Also check if user has the pod's base management HAT (for existing pods)
            const managementPermissions = pod.management_hat_id 
              ? await checkHatPermissions(address, pod.management_hat_id)
              : { hasHat: false, isActive: false, canManage: false };

            canManage[pod.id] = leaderPermissions.canManage || managementPermissions.canManage;
            
            console.log(`🎩 Pod ${pod.name}:`, {
              podId: pod.id,
              leaderHat: {
                id: leaderHatId,
                permissions: leaderPermissions
              },
              managementHat: {
                id: pod.management_hat_id,
                permissions: managementPermissions
              },
              canManage: canManage[pod.id]
            });
          } catch (error) {
            console.error(`Error checking permissions for pod ${pod.id}:`, error);
            canManage[pod.id] = false;
          }
        })
      );

      setPermissions({
        canManage,
        loading: false,
        error: null
      });

    } catch (error) {
      console.error('Failed to check HAT permissions:', error);
      setPermissions({
        canManage: {},
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to check permissions'
      });
    }
  }, [address, publicClient, allPods]); // Removed checkHatPermissions - it's stable with publicClient dependency

  useEffect(() => {
    // Debounce permission checks to prevent rapid re-renders and API rate limiting
    const timeoutId = setTimeout(() => {
      checkAllPermissions();
    }, 500); // Wait 500ms before checking permissions

    return () => clearTimeout(timeoutId);
  }, [checkAllPermissions]);

  // Filter pods to only those user can manage
  const managedPods = (allPods || []).filter(pod => permissions.canManage?.[pod.id]);

  return {
    canManage: permissions.canManage,
    managedPods,
    loading: permissions.loading,
    error: permissions.error
  };
}

/**
 * Hook for creating manager HATs when new pods are created
 * Uses proper contract integration instead of prediction
 */
export function useManagerHatCreation() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [pendingTransaction, setPendingTransaction] = useState<string | null>(null);
  const [transactionStatus, setTransactionStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');

  const createManagerHat = useCallback(async (
    parentPodHatId: string,
    podName: string,
    podImageUri: string
  ): Promise<string | null> => {
    if (!address || !publicClient || !walletClient) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('🎩 Creating manager HAT for pod:', podName);
      console.log('🎩 Parent HAT ID:', parentPodHatId);
      
      setTransactionStatus('pending');

      // Initialize Hats Core Service
      const hatsService = getHatsCoreService(publicClient, walletClient);
      await hatsService.initialize();

      // Generate hat image URL if not provided
      const imageUri = podImageUri || hatsService.generateHatImageUrl(`${podName} Manager`, true);

      // Create the hat using SDK
      const result = await hatsService.createHat({
        admin: parentPodHatId,
        details: `${podName} Pod Management`,
        maxSupply: 5, // Maximum 5 pod managers
        eligibility: '0x0000000000000000000000000000000000000001', // Use address(1) instead of zero
        toggle: address as `0x${string}`, // Toggle: creator address for permission management
        mutable: true,
        imageURI: imageUri
      });

      console.log('🎩 Manager HAT created successfully:', {
        podName,
        parentHatId: parentPodHatId,
        newHatId: result.hatId,
        transactionHash: result.transactionHash
      });

      setPendingTransaction(result.transactionHash);
      setTransactionStatus('success');
      
      return result.hatId;
    } catch (error) {
      console.error('❌ Failed to create manager HAT:', error);
      setTransactionStatus('error');
      logHatError(error, {
        action: 'create_manager_hat',
        hatId: parentPodHatId,
        userAddress: address
      });
      throw error;
    }
  }, [address, publicClient, walletClient]);

  // Helper function to get transaction data without executing
  const getCreateHatTransactionData = useCallback((
    parentPodHatId: string,
    podName: string,
    podImageUri: string
  ) => {
    const hatDetails = `${podName} Pod Management`;
    const maxSupply = 5;
    const eligibilityModule = '0x0000000000000000000000000000000000000001';
    const toggleModule = parentPodHatId; // FIXED: Use parent hat as toggle module instead of address(1)
    const mutable = true;
    
    return {
      to: HATS_CONFIG.CONTRACT_ADDRESS as `0x${string}`,
      data: {
        abi: HATS_ABI,
        functionName: 'createHat' as const,
        args: [
          BigInt(parentPodHatId),
          hatDetails,
          maxSupply,
          eligibilityModule as `0x${string}`,
          toggleModule as `0x${string}`,
          mutable,
          podImageUri
        ]
      }
    };
  }, []);

  return {
    createManagerHat,
    getCreateHatTransactionData,
    transactionStatus,
    pendingTransaction
  };
}