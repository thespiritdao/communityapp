import { getContract } from 'viem';
import { publicClient } from '@/config/wagmi.client';

// Known HAT IDs
const EXECUTIVE_POD_HAT = '0x0000008800010000000000000000000000000000000000000000000000000000';

// Contract addresses
const HATS_CONTRACT = '0x3bc1a0ad72417f2d411118085256fc53cbddd137' as `0x${string}`;
const TREASURY_FACTORY = process.env.NEXT_PUBLIC_POD_TREASURY_FACTORY as `0x${string}`;

// ABIs
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
  }
] as const;

const FACTORY_ABI = [
  {
    name: 'getTreasuryForPod',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view'
  }
] as const;

const TREASURY_ABI = [
  {
    name: 'managementHatId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'hatsContract',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view'
  }
] as const;

/**
 * Debug HAT ID mismatch between user's HATs and treasury's expected HAT
 * This will show exactly why the proxy is rejecting the transaction
 */
export async function debugTreasuryHatMismatch(
  userAddress: string,
  podId = 'e35c9e25-d29f-4988-b1e8-2902e960b94c'
) {
  console.log('🔍 DEBUGGING TREASURY HAT MISMATCH');
  console.log('='.repeat(60));
  console.log('User Address:', userAddress);
  console.log('Pod ID:', podId);
  console.log('Executive Pod HAT:', EXECUTIVE_POD_HAT);
  console.log();

  try {
    // Step 1: Get treasury address from factory
    const factoryContract = getContract({
      address: TREASURY_FACTORY,
      abi: FACTORY_ABI,
      client: publicClient,
    });

    const treasuryAddress = await factoryContract.read.getTreasuryForPod([podId]);
    console.log('📍 Treasury Address:', treasuryAddress);

    if (treasuryAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('No treasury found for this pod');
    }

    // Step 2: Get management HAT ID from treasury contract
    const treasuryContract = getContract({
      address: treasuryAddress as `0x${string}`,
      abi: TREASURY_ABI,
      client: publicClient,
    });

    const treasuryManagementHatId = await treasuryContract.read.managementHatId();
    const treasuryHatsContract = await treasuryContract.read.hatsContract();

    console.log('🏦 Treasury Contract Says:');
    console.log('- Management HAT ID:', `0x${treasuryManagementHatId.toString(16).padStart(64, '0')}`);
    console.log('- HATs Contract:', treasuryHatsContract);
    console.log();

    // Step 3: Check user's HAT balances
    const hatsContract = getContract({
      address: HATS_CONTRACT,
      abi: HATS_ABI,
      client: publicClient,
    });

    const executiveHatBalance = await hatsContract.read.balanceOf([
      userAddress as `0x${string}`,
      BigInt(EXECUTIVE_POD_HAT)
    ]);

    const treasuryRequiredHatBalance = await hatsContract.read.balanceOf([
      userAddress as `0x${string}`,
      treasuryManagementHatId
    ]);

    console.log('🎩 HAT Balance Check:');
    console.log('- Executive Pod HAT Balance:', executiveHatBalance.toString());
    console.log('- Treasury Required HAT Balance:', treasuryRequiredHatBalance.toString());
    console.log();

    // Step 4: Comparison and diagnosis
    const executiveHatHex = EXECUTIVE_POD_HAT;
    const treasuryHatHex = `0x${treasuryManagementHatId.toString(16).padStart(64, '0')}`;
    const hatsMatch = executiveHatHex.toLowerCase() === treasuryHatHex.toLowerCase();

    console.log('🎯 DIAGNOSIS:');
    console.log('- Executive HAT:', executiveHatHex);
    console.log('- Treasury Expects:', treasuryHatHex);
    console.log('- HAT IDs Match:', hatsMatch);
    console.log('- User has Executive HAT:', executiveHatBalance > 0n);
    console.log('- User has Treasury HAT:', treasuryRequiredHatBalance > 0n);
    console.log();

    if (!hatsMatch) {
      console.log('❌ PROBLEM: HAT ID MISMATCH');
      console.log('The treasury contract expects a different HAT than your Executive Pod HAT!');
      console.log();
      console.log('💡 SOLUTIONS:');
      console.log('1. Update treasury contract to use Executive Pod HAT ID');
      console.log('2. Mint the treasury\'s expected HAT to your address');
      console.log('3. Check if treasury was deployed with wrong HAT ID');
    } else if (treasuryRequiredHatBalance === 0n) {
      console.log('❌ PROBLEM: HAT NOT MINTED');
      console.log('HAT IDs match, but the HAT is not minted to your address!');
      console.log();
      console.log('💡 SOLUTION:');
      console.log('Mint the management HAT to your address using the pod creation contract');
    } else {
      console.log('✅ ALL GOOD');
      console.log('HAT IDs match and you have the required HAT. The issue might be elsewhere.');
    }

    return {
      treasuryAddress,
      executiveHatId: executiveHatHex,
      treasuryExpectedHatId: treasuryHatHex,
      hatsMatch,
      userHasExecutiveHat: executiveHatBalance > 0n,
      userHasTreasuryHat: treasuryRequiredHatBalance > 0n,
      executiveHatBalance: executiveHatBalance.toString(),
      treasuryHatBalance: treasuryRequiredHatBalance.toString()
    };

  } catch (error) {
    console.error('❌ Debug failed:', error);
    throw error;
  }
}

// Browser helper
if (typeof window !== 'undefined') {
  window.debugTreasuryHatMismatch = debugTreasuryHatMismatch;
  console.log('🔍 Treasury HAT Debug loaded:');
  console.log('Usage: debugTreasuryHatMismatch("YOUR_WALLET_ADDRESS")');
  console.log('Example: debugTreasuryHatMismatch("0x1234...")');
}