/**
 * Diagnostic Script for Time-Bound Pod Access Issues
 *
 * Run this in browser console to debug why you don't have management access
 *
 * Usage:
 * 1. Go to the pod management page
 * 2. Open browser console (F12)
 * 3. Copy/paste this entire script
 * 4. Run: await diagnoseTimeBoundPod('YOUR_POD_ID', 'YOUR_HAT_ID')
 */

import { TimeBasedToggleService } from '@/features/pods/services/TimeBasedToggleService';
import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

export async function diagnoseTimeBoundPod(podId: string, hatId: string) {
  console.log('🔍 === DIAGNOSING TIME-BOUND POD ACCESS ===');
  console.log('Pod ID:', podId);
  console.log('HAT ID:', hatId);
  console.log('');

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(),
  });

  try {
    // 1. Check if TimeBasedToggleModule is configured
    console.log('📋 Step 1: Check TimeBasedToggleModule Configuration');
    const isConfigured = TimeBasedToggleService.isConfigured();
    const moduleAddress = TimeBasedToggleService.getModuleAddress();

    console.log('  ✓ Module Configured:', isConfigured);
    console.log('  ✓ Module Address:', moduleAddress || 'NOT SET');

    if (!isConfigured) {
      console.error('  ❌ TimeBasedToggleModule not configured!');
      console.log(
        '  → Solution: Deploy module and set NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE',
      );
      return;
    }
    console.log('');

    // 2. Check HAT configuration
    console.log('📋 Step 2: Check HAT Configuration');
    const hatIdBigInt = BigInt(hatId);

    // Get toggle module from HAT
    const toggleModule = (await publicClient.readContract({
      address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
      abi: [
        {
          name: 'getHatToggleModule',
          type: 'function',
          inputs: [{ name: 'hatId', type: 'uint256' }],
          outputs: [{ name: '', type: 'address' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'getHatToggleModule',
      args: [hatIdBigInt],
    })) as `0x${string}`;

    console.log('  ✓ HAT Toggle Module:', toggleModule);
    console.log('  ✓ Expected (TimeBasedToggleModule):', moduleAddress);
    console.log(
      '  ✓ Match:',
      toggleModule.toLowerCase() === moduleAddress?.toLowerCase(),
    );

    if (toggleModule.toLowerCase() !== moduleAddress?.toLowerCase()) {
      console.warn('  ⚠️ Toggle module mismatch!');
      console.log('  → This HAT was created with a different toggle module');
      console.log('  → Time-based expiration will NOT work');
      console.log(
        '  → This is expected for pods created BEFORE the integration',
      );
      return;
    }
    console.log('');

    // 3. Check time window configuration
    console.log('📋 Step 3: Check Time Window Configuration');
    const timeWindow =
      await TimeBasedToggleService.getHatTimeWindow(hatIdBigInt);

    console.log(
      '  ✓ Start Time:',
      TimeBasedToggleService.formatTimestamp(timeWindow.startTime),
    );
    console.log(
      '  ✓ Expiration:',
      TimeBasedToggleService.formatTimestamp(timeWindow.expiration),
    );
    console.log('  ✓ Is Active:', timeWindow.isActive);
    console.log(
      '  ✓ Time Until Expiration:',
      timeWindow.timeUntilExpiration.toString(),
      'seconds',
    );

    if (timeWindow.expiration === 0n) {
      console.log('  ℹ️ No expiration set (HAT never expires)');
    } else if (!timeWindow.isActive) {
      const now = Math.floor(Date.now() / 1000);
      const expirationSeconds = Number(timeWindow.expiration);

      if (now >= expirationSeconds) {
        console.warn('  ⚠️ HAT HAS EXPIRED!');
        console.log(
          '  → Expired:',
          new Date(expirationSeconds * 1000).toLocaleString(),
        );
        console.log('  → Now:', new Date(now * 1000).toLocaleString());
        console.log(
          '  → This is WORKING AS INTENDED - automatic expiration is functioning!',
        );
      } else if (now < Number(timeWindow.startTime)) {
        console.warn('  ⚠️ HAT NOT STARTED YET!');
        console.log(
          '  → Start Time:',
          new Date(Number(timeWindow.startTime) * 1000).toLocaleString(),
        );
        console.log('  → Now:', new Date(now * 1000).toLocaleString());
      }
    }
    console.log('');

    // 4. Check HAT status via Hats Protocol
    console.log('📋 Step 4: Check HAT Status (Hats Protocol)');
    const status = await TimeBasedToggleService.getHatStatus(hatIdBigInt);
    console.log('  ✓ HAT Active (via toggle):', status);
    console.log('');

    // 5. Check user's HAT balance
    console.log('📋 Step 5: Check Your HAT Balance');
    const userAddress = (window as any).ethereum?.selectedAddress;
    if (!userAddress) {
      console.warn('  ⚠️ No wallet connected');
    } else {
      const balance = (await publicClient.readContract({
        address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
        abi: [
          {
            name: 'balanceOf',
            type: 'function',
            inputs: [
              { name: 'account', type: 'address' },
              { name: 'id', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view',
          },
        ],
        functionName: 'balanceOf',
        args: [userAddress as `0x${string}`, hatIdBigInt],
      })) as bigint;

      console.log('  ✓ Your Address:', userAddress);
      console.log('  ✓ HAT Balance:', balance.toString());
      console.log('  ✓ Has HAT:', balance > 0n);

      if (balance === 0n && status) {
        console.warn("  ⚠️ HAT is active but you don't have it!");
        console.log('  → The HAT was not minted to you');
        console.log('  → Or you never claimed it');
      } else if (balance > 0n && !status) {
        console.warn("  ⚠️ You have the HAT but it's INACTIVE!");
        console.log(
          '  → This means time-based expiration is WORKING correctly',
        );
        console.log('  → The HAT has expired automatically');
      } else if (balance === 0n && !status) {
        console.log("  ℹ️ HAT is inactive AND you don't have it");
        console.log('  → Either expired or never minted');
      } else {
        console.log('  ✅ Everything looks good! You have an active HAT');
      }
    }
    console.log('');

    // 6. Summary
    console.log('📊 === DIAGNOSTIC SUMMARY ===');
    console.log('');

    if (!isConfigured) {
      console.log('❌ ISSUE: TimeBasedToggleModule not configured');
      console.log('   FIX: Deploy module and set environment variable');
    } else if (toggleModule.toLowerCase() !== moduleAddress?.toLowerCase()) {
      console.log('⚠️ ISSUE: HAT using wrong toggle module');
      console.log(
        '   EXPLANATION: Pod created before TimeBasedToggleModule integration',
      );
      console.log(
        '   SOLUTION: Only affects old pods, new pods will work correctly',
      );
    } else if (!timeWindow.isActive) {
      console.log('✅ WORKING CORRECTLY: Time-based expiration is functioning');
      console.log('   The HAT has expired as configured');
      console.log('   This is the intended behavior!');
    } else {
      console.log('✅ Everything configured correctly');
      console.log('   HAT is active and time-based expiration is ready');
    }
  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
    console.log('Error details:', error);
  }
}

// For browser console usage
if (typeof window !== 'undefined') {
  (window as any).diagnoseTimeBoundPod = diagnoseTimeBoundPod;
  console.log('✅ Diagnostic script loaded!');
  console.log('Usage: await diagnoseTimeBoundPod("POD_ID", "HAT_ID")');
}
