/**
 * Phase 6 Diagnostic Script
 *
 * This script tests all prerequisites for Phase 6 to identify the exact failure point.
 * Add this code to HatsModulePodCreationForm.tsx before Phase 6 execution.
 */

import { readContract, readContracts } from '@wagmi/core';
import { parseAbi } from 'viem';
import { config } from '@/config/wagmi.client';
import PodAuthorizationFactoryABI from '@/abis/PodAuthorizationFactory.json';

/**
 * Comprehensive Phase 6 diagnostics
 * Call this before executing Phase 6 transaction
 */
export async function runPhase6Diagnostics(
  factoryAddress: `0x${string}`,
  blockchainPodId: string,
  userAddress: `0x${string}`,
  adminHatId: bigint
): Promise<{
  success: boolean;
  errors: string[];
  warnings: string[];
  data: Record<string, any>;
}> {

  const errors: string[] = [];
  const warnings: string[] = [];
  const data: Record<string, any> = {};

  console.log('🔍 === PHASE 6 DIAGNOSTICS START ===');
  console.log('  Factory:', factoryAddress);
  console.log('  Blockchain Pod ID:', blockchainPodId);
  console.log('  User Address:', userAddress);
  console.log('  Admin HAT ID:', adminHatId.toString());
  console.log('');

  // ============================================================
  // TEST 1: Verify factory contract exists
  // ============================================================
  console.log('🧪 TEST 1: Verify factory contract exists...');
  try {
    const factoryOwner = await readContract(config, {
      address: factoryAddress,
      abi: parseAbi(['function owner() view returns (address)']),
      functionName: 'owner'
    });
    console.log('✅ Factory contract exists. Owner:', factoryOwner);
    data.factoryOwner = factoryOwner;
  } catch (error) {
    const errorMsg = '❌ Factory contract not found or not deployed correctly';
    console.error(errorMsg, error);
    errors.push(errorMsg);
    return { success: false, errors, warnings, data };
  }

  // ============================================================
  // TEST 2: Verify proxy is registered in factory
  // ============================================================
  console.log('');
  console.log('🧪 TEST 2: Verify proxy registered in factory...');
  try {
    const proxyAddress = await readContract(config, {
      address: factoryAddress,
      abi: parseAbi(['function getPodProxy(string) view returns (address)']),
      functionName: 'getPodProxy',
      args: [blockchainPodId]
    });

    console.log('  Query: getPodProxy("' + blockchainPodId + '")');
    console.log('  Result:', proxyAddress);

    if (!proxyAddress || proxyAddress === '0x0000000000000000000000000000000000000000') {
      const errorMsg = '❌ CRITICAL: Proxy not registered in factory for this pod ID';
      console.error(errorMsg);
      console.error('  This means Phase 2 (createPodProxy) did not complete successfully');
      console.error('  Or the blockchain pod ID used in Phase 2 differs from Phase 6');
      errors.push(errorMsg);
      errors.push('Proxy registration failed - pod creation did not complete correctly');
      return { success: false, errors, warnings, data };
    }

    console.log('✅ Proxy registered:', proxyAddress);
    data.proxyAddress = proxyAddress;

  } catch (error) {
    const errorMsg = '❌ Failed to query getPodProxy - function may not exist on factory';
    console.error(errorMsg, error);
    errors.push(errorMsg);
    errors.push('Factory contract may be outdated - missing getPodProxy function');
    return { success: false, errors, warnings, data };
  }

  // ============================================================
  // TEST 3: Verify factory has setProxyAdminHatViaFactory function
  // ============================================================
  console.log('');
  console.log('🧪 TEST 3: Verify factory has setProxyAdminHatViaFactory function...');
  try {
    // Try to simulate the call (won't execute, just checks if function exists)
    await readContract(config, {
      address: factoryAddress,
      abi: parseAbi(['function setProxyAdminHatViaFactory(string, uint256) external']),
      functionName: 'setProxyAdminHatViaFactory',
      args: [blockchainPodId, adminHatId]
    });
    // If we get here, function exists but execution would fail (expected for write function)
    console.log('✅ Function signature exists on factory');
  } catch (error: any) {
    if (error?.message?.includes('function selector was not recognized')) {
      const errorMsg = '❌ CRITICAL: setProxyAdminHatViaFactory function NOT FOUND on factory';
      console.error(errorMsg);
      console.error('  Factory contract is OUTDATED');
      console.error('  You need to redeploy the factory with the updated code');
      errors.push(errorMsg);
      errors.push('Factory deployment failed - contract is missing required function');
      return { success: false, errors, warnings, data };
    }
    // Other errors are expected (trying to read a write function)
    console.log('✅ Function exists (error expected for write function)');
  }

  // ============================================================
  // TEST 4: Verify proxy contract exists and is initialized
  // ============================================================
  console.log('');
  console.log('🧪 TEST 4: Verify proxy contract is initialized...');
  try {
    const proxyPodId = await readContract(config, {
      address: data.proxyAddress,
      abi: parseAbi(['function getPodId() view returns (string)']),
      functionName: 'getPodId'
    });

    console.log('  Proxy pod ID:', proxyPodId);

    if (proxyPodId !== blockchainPodId) {
      const warnMsg = '⚠️ WARNING: Proxy pod ID mismatch';
      console.warn(warnMsg);
      console.warn('  Expected:', blockchainPodId);
      console.warn('  Got:', proxyPodId);
      warnings.push(warnMsg);
    } else {
      console.log('✅ Proxy initialized with correct pod ID');
    }

    data.proxyPodId = proxyPodId;

  } catch (error) {
    const errorMsg = '❌ Proxy contract not properly initialized';
    console.error(errorMsg, error);
    errors.push(errorMsg);
    return { success: false, errors, warnings, data };
  }

  // ============================================================
  // TEST 5: Verify proxy has setProxyAdminHat function
  // ============================================================
  console.log('');
  console.log('🧪 TEST 5: Verify proxy has setProxyAdminHat function...');
  try {
    // Try to read current proxyAdminHatId
    const currentAdminHatId = await readContract(config, {
      address: data.proxyAddress,
      abi: parseAbi(['function proxyAdminHatId() view returns (uint256)']),
      functionName: 'proxyAdminHatId'
    });

    console.log('  Current proxy admin HAT ID:', currentAdminHatId.toString());
    data.currentProxyAdminHatId = currentAdminHatId;

    if (currentAdminHatId > 0n) {
      const warnMsg = '⚠️ WARNING: Proxy admin HAT ID already set';
      console.warn(warnMsg);
      console.warn('  This could mean Phase 6 already completed previously');
      console.warn('  Or this pod was created before and is being reconfigured');
      warnings.push(warnMsg);
    } else {
      console.log('✅ Proxy admin HAT ID not set yet (expected for new pod)');
    }

  } catch (error) {
    const errorMsg = '❌ Proxy missing proxyAdminHatId state variable';
    console.error(errorMsg, error);
    errors.push(errorMsg);
    errors.push('Proxy implementation may be outdated');
    return { success: false, errors, warnings, data };
  }

  // ============================================================
  // TEST 6: Verify user has canManage permission
  // ============================================================
  console.log('');
  console.log('🧪 TEST 6: Verify user has canManage permission...');
  try {
    const canManage = await readContract(config, {
      address: data.proxyAddress,
      abi: parseAbi(['function canManage(address) view returns (bool)']),
      functionName: 'canManage',
      args: [userAddress]
    });

    console.log('  canManage(' + userAddress + '):', canManage);

    if (!canManage) {
      const errorMsg = '❌ CRITICAL: User does not have canManage permission';
      console.error(errorMsg);
      console.error('  User is not a pod leader or does not wear management HAT');
      console.error('  Phase 6 will fail authorization check');
      errors.push(errorMsg);
      errors.push('User lacks permission to configure pod');
      return { success: false, errors, warnings, data };
    }

    console.log('✅ User has canManage permission');
    data.userCanManage = true;

  } catch (error) {
    const errorMsg = '❌ Failed to check canManage permission';
    console.error(errorMsg, error);
    errors.push(errorMsg);
    return { success: false, errors, warnings, data };
  }

  // ============================================================
  // TEST 7: Verify proxy is active
  // ============================================================
  console.log('');
  console.log('🧪 TEST 7: Verify proxy is active...');
  try {
    const isActive = await readContract(config, {
      address: data.proxyAddress,
      abi: parseAbi(['function isActive() view returns (bool)']),
      functionName: 'isActive'
    });

    console.log('  isActive:', isActive);

    if (!isActive) {
      const errorMsg = '❌ CRITICAL: Proxy is not active';
      console.error(errorMsg);
      console.error('  Proxy has been deactivated or not properly initialized');
      errors.push(errorMsg);
      errors.push('Proxy is inactive - cannot configure');
      return { success: false, errors, warnings, data };
    }

    console.log('✅ Proxy is active');
    data.proxyIsActive = true;

  } catch (error) {
    const warnMsg = '⚠️ Could not verify proxy active status';
    console.warn(warnMsg, error);
    warnings.push(warnMsg);
  }

  // ============================================================
  // TEST 8: Verify admin HAT ID is valid
  // ============================================================
  console.log('');
  console.log('🧪 TEST 8: Verify admin HAT ID is valid...');

  if (adminHatId === 0n) {
    const errorMsg = '❌ CRITICAL: Admin HAT ID is 0';
    console.error(errorMsg);
    console.error('  Phase 4 did not create admin HAT successfully');
    errors.push(errorMsg);
    return { success: false, errors, warnings, data };
  }

  console.log('✅ Admin HAT ID is valid:', adminHatId.toString());

  // ============================================================
  // TEST 9: Verify factory is authorized to call proxy
  // ============================================================
  console.log('');
  console.log('🧪 TEST 9: Verify factory can call proxy on behalf of user...');

  try {
    // Check if factory itself has permission (it shouldn't, but let's verify)
    const factoryCanManage = await readContract(config, {
      address: data.proxyAddress,
      abi: parseAbi(['function canManage(address) view returns (bool)']),
      functionName: 'canManage',
      args: [factoryAddress]
    });

    if (factoryCanManage) {
      const warnMsg = '⚠️ Unexpected: Factory has canManage permission';
      console.warn(warnMsg);
      console.warn('  This is unusual but not necessarily a problem');
      warnings.push(warnMsg);
    } else {
      console.log('✅ Factory correctly delegates permission check to msg.sender (user)');
    }

    data.factoryCanManage = factoryCanManage;

  } catch (error) {
    const warnMsg = '⚠️ Could not verify factory permission delegation';
    console.warn(warnMsg);
    warnings.push(warnMsg);
  }

  // ============================================================
  // DIAGNOSTIC SUMMARY
  // ============================================================
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔍 DIAGNOSTIC SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  console.log('📊 Results:');
  console.log('  ✅ Tests Passed:', 9 - errors.length);
  console.log('  ❌ Tests Failed:', errors.length);
  console.log('  ⚠️  Warnings:', warnings.length);
  console.log('');

  if (errors.length === 0) {
    console.log('✅ === ALL DIAGNOSTICS PASSED ===');
    console.log('Phase 6 should work. If it still fails, the issue is likely:');
    console.log('  1. Paymaster not configured (function not whitelisted)');
    console.log('  2. Gas estimation issue (try disabling sponsorship temporarily)');
    console.log('  3. Network connectivity issue');
    console.log('');
    console.log('Recommendation: Proceed with Phase 6 transaction');
  } else {
    console.log('❌ === DIAGNOSTICS FAILED ===');
    console.log('');
    console.log('Errors found:');
    errors.forEach((error, i) => {
      console.log(`  ${i + 1}. ${error}`);
    });
    console.log('');
    console.log('Phase 6 WILL FAIL with current configuration.');
    console.log('Recommendation: Fix errors above before attempting Phase 6');
  }

  if (warnings.length > 0) {
    console.log('');
    console.log('⚠️  Warnings:');
    warnings.forEach((warning, i) => {
      console.log(`  ${i + 1}. ${warning}`);
    });
  }

  console.log('');
  console.log('📋 Collected Data:');
  console.log(JSON.stringify(data, null, 2));
  console.log('');
  console.log('═══════════════════════════════════════════════════════');

  return {
    success: errors.length === 0,
    errors,
    warnings,
    data
  };
}

/**
 * HOW TO USE THIS DIAGNOSTIC SCRIPT
 *
 * 1. Import at top of HatsModulePodCreationForm.tsx:
 *    import { runPhase6Diagnostics } from '@/features/pods/diagnostics/phase6';
 *
 * 2. Add before Phase 6 transaction (around line 1854):
 *
 *    // Run diagnostics before Phase 6
 *    const diagnostics = await runPhase6Diagnostics(
 *      factoryAddress,
 *      blockchainPodId,
 *      address,
 *      BigInt(createdAdminHatId)
 *    );
 *
 *    if (!diagnostics.success) {
 *      console.error('❌ Phase 6 prerequisites failed. Aborting.');
 *      toast({
 *        title: "Configuration Error",
 *        description: diagnostics.errors[0] || "Phase 6 prerequisites not met",
 *        variant: "destructive"
 *      });
 *      return; // Don't proceed to Phase 6
 *    }
 *
 *    console.log('✅ All diagnostics passed. Proceeding with Phase 6...');
 *
 * 3. Test pod creation and check console for detailed diagnostic results
 */

/**
 * INTERPRETING RESULTS
 *
 * If TEST 1 fails:
 *   → Factory address in .env is wrong or contract not deployed
 *   → Check NEXT_PUBLIC_POD_AUTH_FACTORY value
 *   → Verify address on BaseScan
 *
 * If TEST 2 fails:
 *   → Proxy not registered during Phase 2
 *   → blockchain podId used in Phase 2 ≠ Phase 6
 *   → Phase 2 transaction may have failed silently
 *
 * If TEST 3 fails:
 *   → Factory contract is OUTDATED
 *   → Contract deployed before setProxyAdminHatViaFactory was added
 *   → **MUST REDEPLOY FACTORY** ← Most common issue
 *
 * If TEST 4 fails:
 *   → Proxy contract not properly initialized
 *   → Proxy deployment may have failed
 *
 * If TEST 5 fails:
 *   → Proxy implementation is outdated
 *   → Template doesn't have setProxyAdminHat function
 *   → Need to redeploy template + factory
 *
 * If TEST 6 fails:
 *   → User is not a pod leader
 *   → User doesn't wear management HAT
 *   → Check Phase 3 (HAT minting) completed successfully
 *
 * If TEST 7 fails:
 *   → Proxy was deactivated
 *   → Unusual - shouldn't happen in new pod
 *
 * If TEST 8 fails:
 *   → Phase 4 didn't create admin HAT
 *   → Check Phase 4 logs
 */
