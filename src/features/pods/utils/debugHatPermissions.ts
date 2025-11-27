import { getContract } from 'viem';
import { publicClient } from '@/config/wagmi.client';

// HATs Contract Address
const HATS_CONTRACT = '0x3bc1a0ad72417f2d411118085256fc53cbddd137' as `0x${string}`;

// HATs ABI for permission checking
const HATS_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
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
    name: 'viewHat',
    type: 'function',
    inputs: [{ name: 'hatId', type: 'uint256' }],
    outputs: [
      { name: 'details', type: 'string' },
      { name: 'maxSupply', type: 'uint32' },
      { name: 'supply', type: 'uint32' },
      { name: 'eligibility', type: 'address' },
      { name: 'toggle', type: 'address' },
      { name: 'imageURI', type: 'string' },
      { name: 'lastHatId', type: 'uint16' },
      { name: 'mutable', type: 'bool' },
      { name: 'active', type: 'bool' }
    ],
    stateMutability: 'view'
  }
] as const;

/**
 * Debug HAT permissions for treasury management
 * @param userAddress - User's wallet address
 * @param managementHatId - Pod's management HAT ID
 */
export async function debugHatPermissions(
  userAddress: string,
  managementHatId: string | null
): Promise<{
  hasManagementHat: boolean;
  hatBalance: string;
  hatActive: boolean;
  hatDetails: any;
}> {
  console.log('🎩 Debugging HAT permissions...');
  console.log('User Address:', userAddress);
  console.log('Management Hat ID:', managementHatId);

  if (!managementHatId) {
    console.log('❌ No management HAT ID provided');
    return {
      hasManagementHat: false,
      hatBalance: '0',
      hatActive: false,
      hatDetails: null
    };
  }

  try {
    const hatsContract = getContract({
      address: HATS_CONTRACT,
      abi: HATS_ABI,
      client: publicClient,
    });

    // Check user's HAT balance
    const hatBalance = await hatsContract.read.balanceOf([
      userAddress as `0x${string}`,
      BigInt(managementHatId)
    ]);

    // Check if HAT is active
    const hatActive = await hatsContract.read.isActive([BigInt(managementHatId)]);

    // Get HAT details
    const hatDetails = await hatsContract.read.viewHat([BigInt(managementHatId)]);

    const hasManagementHat = hatBalance > 0n;

    console.log('🎩 HAT Permission Results:');
    console.log('- HAT Balance:', hatBalance.toString());
    console.log('- Has Management HAT:', hasManagementHat);
    console.log('- HAT Active:', hatActive);
    console.log('- HAT Details:', hatDetails);

    return {
      hasManagementHat,
      hatBalance: hatBalance.toString(),
      hatActive,
      hatDetails
    };

  } catch (error) {
    console.error('❌ Error checking HAT permissions:', error);
    throw error;
  }
}

/**
 * Debug complete treasury permissions for a pod
 * @param userAddress - User's wallet address  
 * @param podId - Pod ID
 * @param managementHatId - Pod's management HAT ID
 */
export async function debugPodTreasuryPermissions(
  userAddress: string,
  podId: string,
  managementHatId: string | null
) {
  console.log('🏦 Complete Pod Treasury Permission Debug');
  console.log('='.repeat(50));
  
  try {
    // 1. Check HAT permissions
    const hatPermissions = await debugHatPermissions(userAddress, managementHatId);
    
    // 2. Check if user is in pod_leads (database)
    console.log('📋 Additional checks needed:');
    console.log('- Check if user is in pod_leads array in database');
    console.log('- Verify management_hat_id is correct in pod record');
    console.log('- Ensure HAT was actually minted to user');
    
    // 3. Summary
    console.log('🎯 Permission Summary:');
    console.log('- User has management HAT:', hatPermissions.hasManagementHat);
    console.log('- Management HAT active:', hatPermissions.hatActive);
    console.log('- HAT balance:', hatPermissions.hatBalance);
    
    if (!hatPermissions.hasManagementHat) {
      console.log('❌ ISSUE: User does not have the management HAT');
      console.log('💡 Solutions:');
      console.log('1. Mint the management HAT to this user');
      console.log('2. Add user to pod_leads in database');
      console.log('3. Verify the management_hat_id is correct');
    }
    
    return hatPermissions;
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    throw error;
  }
}

// Browser helper
if (typeof window !== 'undefined') {
  window.debugHatPermissions = debugHatPermissions;
  window.debugPodTreasuryPermissions = debugPodTreasuryPermissions;
  console.log('🎩 HAT Debug functions loaded:');
  console.log('- debugHatPermissions(userAddress, managementHatId)');
  console.log('- debugPodTreasuryPermissions(userAddress, podId, managementHatId)');
}