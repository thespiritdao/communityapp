// Run this to understand current state before implementing fixes

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import AdvocateMembershipABI from 'src/abis/AdvocateMembershipABI.json';

const ADVOCATE_ADDRESS = process.env.NEXT_PUBLIC_ADVOCATE as `0x${string}`;

export const checkDelegationStatus = async (userAddress: string) => {
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50'),
  });

  try {
    console.log('=== DELEGATION STATUS ANALYSIS ===');
    console.log('User Address (Coinbase Smart Wallet):', userAddress);
    
    // Check NFT balance
    const balance = await publicClient.readContract({
      address: ADVOCATE_ADDRESS,
      abi: AdvocateMembershipABI,
      functionName: 'balanceOf',
      args: [userAddress as `0x${string}`],
    });
    
    // Check current delegate
    const currentDelegate = await publicClient.readContract({
      address: ADVOCATE_ADDRESS,
      abi: AdvocateMembershipABI,
      functionName: 'delegates',
      args: [userAddress as `0x${string}`],
    });
    
    // Check voting power
    const votingPower = await publicClient.readContract({
      address: ADVOCATE_ADDRESS,
      abi: AdvocateMembershipABI,
      functionName: 'getVotes',
      args: [userAddress as `0x${string}`],
    });
    
    // If delegate is different, check their voting power too
    let delegateVotingPower = 0n;
    if (currentDelegate && currentDelegate !== userAddress) {
      delegateVotingPower = await publicClient.readContract({
        address: ADVOCATE_ADDRESS,
        abi: AdvocateMembershipABI,
        functionName: 'getVotes',
        args: [currentDelegate as `0x${string}`],
      });
    }
    
    console.log('Results:');
    console.log('- NFT Balance:', balance.toString());
    console.log('- Current Delegate:', currentDelegate);
    console.log('- Your Voting Power:', votingPower.toString());
    console.log('- Delegate\'s Voting Power:', delegateVotingPower.toString());
    console.log('- Self-Delegated:', currentDelegate?.toLowerCase() === userAddress.toLowerCase());
    console.log('- Zero Address Delegate:', currentDelegate === '0x0000000000000000000000000000000000000000');
    
    // Diagnosis
    if (balance > 0 && votingPower === 0n) {
      if (currentDelegate === '0x0000000000000000000000000000000000000000') {
        console.log('🔴 ISSUE: You have NFTs but no delegation set (zero address)');
        console.log('✅ SOLUTION: Need to delegate to yourself');
      } else if (currentDelegate.toLowerCase() !== userAddress.toLowerCase()) {
        console.log('🔴 ISSUE: NFTs delegated to different address');
        console.log('🔴 Delegated to:', currentDelegate);
        console.log('✅ SOLUTION: Need to re-delegate to yourself');
      }
    } else if (balance > 0 && votingPower > 0) {
      console.log('✅ GOOD: You have NFTs and voting power');
    } else if (balance === 0n) {
      console.log('🔴 ISSUE: No NFTs found at this address');
    }
    
    return {
      balance,
      currentDelegate,
      votingPower,
      delegateVotingPower,
      needsReDelegation: balance > 0 && currentDelegate?.toLowerCase() !== userAddress.toLowerCase()
    };
    
  } catch (error) {
    console.error('Error checking delegation status:', error);
    return null;
  }
};

// Usage in your component:
// const status = await checkDelegationStatus(0x12a0cf22D632c859B793F852af03b9d515580244);