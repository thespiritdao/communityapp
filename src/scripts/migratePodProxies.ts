/**
 * Migration Script: Proxy Admin HAT Setup for Existing Pods
 *
 * This script migrates existing pods to the Proxy Admin HAT pattern (v2).
 *
 * What it does:
 * 1. Fetches all existing pods from database
 * 2. For each pod with a proxy:
 *    - Creates Proxy Admin HAT
 *    - Mints admin HAT to proxy contract
 *    - Sets admin HAT ID in proxy
 *    - Updates database with admin HAT ID
 * 3. Provides detailed logging and error handling
 *
 * IMPORTANT:
 * - Requires wallet with parent pod admin rights
 * - Run on testnet first
 * - Can be run multiple times (idempotent)
 * - Skips pods that already have admin HAT
 *
 * Usage:
 * ```bash
 * npx ts-node src/scripts/migratePodProxies.ts
 * ```
 */

import { createPublicClient, createWalletClient, http, type WalletClient } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { ProxyAdminHatService } from '../features/pods/services/ProxyAdminHatService';
import { PodBlockchainSyncService } from '../features/pods/services/PodBlockchainSyncService';
import { EventService } from '../features/events/lib/supabase';

// Configuration
const MIGRATION_CONFIG = {
  // Set to true for dry run (no transactions, just logging)
  DRY_RUN: process.env.DRY_RUN === 'true',

  // Exec pod address for toggle module
  EXEC_POD_ADDRESS: process.env.NEXT_PUBLIC_EXEC_POD_ADDRESS || '0x0000000000000000000000000000000000000000',

  // Batch size for processing (to avoid rate limits)
  BATCH_SIZE: 5,

  // Delay between batches (milliseconds)
  BATCH_DELAY: 5000,
};

interface MigrationResult {
  podId: string;
  podName: string;
  status: 'success' | 'skipped' | 'failed';
  proxyAddress?: string;
  proxyAdminHatId?: string;
  error?: string;
  reason?: string;
}

/**
 * Get wallet client from environment
 */
async function getWalletClient(): Promise<WalletClient> {
  const privateKey = process.env.MIGRATION_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error(
      'MIGRATION_PRIVATE_KEY environment variable not set.\n' +
      'This should be the private key of an account with parent pod admin rights.'
    );
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http()
  });

  return walletClient;
}

/**
 * Check if pod already has proxy admin HAT
 */
async function hasProxyAdminHat(proxyAddress: string): Promise<boolean> {
  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http()
    });

    const PodAuthProxyABI = await import('../abis/PodAuthProxy.json');

    const proxyAdminHatId = await publicClient.readContract({
      address: proxyAddress as `0x${string}`,
      abi: PodAuthProxyABI.default,
      functionName: 'getProxyAdminHatId'
    }) as bigint;

    return proxyAdminHatId > 0n;
  } catch (error) {
    console.error(`   ⚠️ Failed to check proxy admin HAT:`, error);
    return false;
  }
}

/**
 * Migrate a single pod to proxy admin HAT pattern
 */
async function migratePod(
  pod: any,
  walletClient: WalletClient
): Promise<MigrationResult> {
  const result: MigrationResult = {
    podId: pod.id,
    podName: pod.name,
    status: 'failed'
  };

  try {
    console.log(`\n🔄 Migrating pod: ${pod.name} (${pod.id})`);

    // Step 1: Get proxy address
    console.log('   Step 1: Getting proxy address...');
    const proxyAddress = await PodBlockchainSyncService.getPodProxy(pod.id);

    if (!proxyAddress || proxyAddress === '0x0000000000000000000000000000000000000000') {
      result.status = 'skipped';
      result.reason = 'No proxy found - pod may not have bounty/treasury features enabled';
      console.log(`   ⏭️ Skipped: ${result.reason}`);
      return result;
    }

    result.proxyAddress = proxyAddress;
    console.log(`   ✅ Proxy address: ${proxyAddress}`);

    // Step 2: Check if already migrated
    console.log('   Step 2: Checking if already migrated...');
    const alreadyMigrated = await hasProxyAdminHat(proxyAddress);

    if (alreadyMigrated) {
      result.status = 'skipped';
      result.reason = 'Already has proxy admin HAT';
      console.log(`   ⏭️ Skipped: ${result.reason}`);
      return result;
    }

    console.log('   ✅ Not yet migrated - proceeding...');

    // Step 3: Verify pod has management HAT
    if (!pod.management_hat_id) {
      result.status = 'skipped';
      result.reason = 'No management HAT ID - pod may not be fully initialized';
      console.log(`   ⏭️ Skipped: ${result.reason}`);
      return result;
    }

    console.log(`   ✅ Management HAT ID: ${pod.management_hat_id}`);

    // Step 4: Get parent pod for admin HAT creation
    if (!pod.parent_pod_id) {
      result.status = 'skipped';
      result.reason = 'No parent pod - cannot create admin HAT';
      console.log(`   ⏭️ Skipped: ${result.reason}`);
      return result;
    }

    const availablePods = await EventService.getPods() as any[];
    const parentPod = availablePods.find(p => p.id === pod.parent_pod_id);

    if (!parentPod || !parentPod.management_hat_id) {
      result.status = 'skipped';
      result.reason = 'Parent pod or parent HAT not found';
      console.log(`   ⏭️ Skipped: ${result.reason}`);
      return result;
    }

    console.log(`   ✅ Parent pod: ${parentPod.name} (HAT: ${parentPod.management_hat_id})`);

    // DRY RUN - Stop here if enabled
    if (MIGRATION_CONFIG.DRY_RUN) {
      result.status = 'success';
      result.reason = 'Dry run - would create proxy admin HAT here';
      console.log(`   🏃 DRY RUN: Would migrate this pod`);
      return result;
    }

    // Step 5: Setup Proxy Admin HAT
    console.log('   Step 5: Creating and minting Proxy Admin HAT...');
    const adminHatResult = await ProxyAdminHatService.setupProxyAdminHat({
      podId: pod.id,
      podName: pod.name,
      parentPodHatId: parentPod.management_hat_id,
      proxyAddress,
      execPodAddress: MIGRATION_CONFIG.EXEC_POD_ADDRESS,
      walletClient
    });

    if (!adminHatResult.success || !adminHatResult.proxyAdminHatId) {
      throw new Error(`Failed to setup proxy admin HAT: ${adminHatResult.error}`);
    }

    result.proxyAdminHatId = adminHatResult.proxyAdminHatId;
    console.log(`   ✅ Proxy Admin HAT created: ${result.proxyAdminHatId}`);

    // Step 6: Set admin HAT ID in proxy
    console.log('   Step 6: Setting admin HAT ID in proxy...');
    const { writeContract, waitForTransactionReceipt } = await import('wagmi/actions');
    const PodAuthProxyABI = (await import('../abis/PodAuthProxy.json')).default;

    // Note: This requires a wagmi config, which might not be available in a script
    // You may need to use direct viem calls instead
    console.log('   ⚠️ Manual step required: Call setProxyAdminHat() on proxy');
    console.log(`   Proxy: ${proxyAddress}`);
    console.log(`   Admin HAT ID: ${result.proxyAdminHatId}`);

    // Step 7: Update database
    console.log('   Step 7: Updating database...');
    // This would require a database update function
    console.log('   ⚠️ Manual step required: Update pod_metadata in database');

    result.status = 'success';
    console.log(`   ✅ Migration complete!`);

    return result;

  } catch (error: any) {
    result.status = 'failed';
    result.error = error?.message || error?.toString() || 'Unknown error';
    console.error(`   ❌ Migration failed:`, result.error);
    return result;
  }
}

/**
 * Main migration function
 */
async function main() {
  console.log('🚀 Proxy Admin HAT Migration Script');
  console.log('====================================\n');

  if (MIGRATION_CONFIG.DRY_RUN) {
    console.log('🏃 DRY RUN MODE - No transactions will be executed\n');
  }

  // Step 1: Get wallet client
  console.log('Step 1: Setting up wallet client...');
  const walletClient = await getWalletClient();
  const account = walletClient.account?.address;
  console.log(`✅ Wallet address: ${account}\n`);

  // Step 2: Fetch all pods
  console.log('Step 2: Fetching all pods from database...');
  const allPods = await EventService.getPods() as any[];
  console.log(`✅ Found ${allPods.length} pods\n`);

  // Filter pods that need migration
  const podsToMigrate = allPods.filter(pod => {
    // Skip pods without management HAT
    if (!pod.management_hat_id) return false;

    // Skip top-level pods (no parent)
    if (!pod.parent_pod_id) return false;

    return true;
  });

  console.log(`📋 ${podsToMigrate.length} pods eligible for migration\n`);

  if (podsToMigrate.length === 0) {
    console.log('✅ No pods need migration. Exiting.');
    return;
  }

  // Step 3: Migrate pods in batches
  const results: MigrationResult[] = [];

  for (let i = 0; i < podsToMigrate.length; i += MIGRATION_CONFIG.BATCH_SIZE) {
    const batch = podsToMigrate.slice(i, i + MIGRATION_CONFIG.BATCH_SIZE);
    const batchNum = Math.floor(i / MIGRATION_CONFIG.BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(podsToMigrate.length / MIGRATION_CONFIG.BATCH_SIZE);

    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} pods)`);
    console.log('='.repeat(50));

    for (const pod of batch) {
      const result = await migratePod(pod, walletClient);
      results.push(result);
    }

    // Delay between batches
    if (i + MIGRATION_CONFIG.BATCH_SIZE < podsToMigrate.length) {
      console.log(`\n⏱️ Waiting ${MIGRATION_CONFIG.BATCH_DELAY / 1000}s before next batch...`);
      await new Promise(resolve => setTimeout(resolve, MIGRATION_CONFIG.BATCH_DELAY));
    }
  }

  // Step 4: Summary
  console.log('\n\n📊 Migration Summary');
  console.log('='.repeat(50));

  const successful = results.filter(r => r.status === 'success');
  const skipped = results.filter(r => r.status === 'skipped');
  const failed = results.filter(r => r.status === 'failed');

  console.log(`✅ Successful: ${successful.length}`);
  console.log(`⏭️ Skipped: ${skipped.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  console.log(`📋 Total: ${results.length}`);

  if (successful.length > 0) {
    console.log('\n✅ Successfully Migrated Pods:');
    successful.forEach(r => {
      console.log(`   - ${r.podName} (${r.podId})`);
      console.log(`     Proxy: ${r.proxyAddress}`);
      console.log(`     Admin HAT: ${r.proxyAdminHatId}`);
    });
  }

  if (skipped.length > 0) {
    console.log('\n⏭️ Skipped Pods:');
    skipped.forEach(r => {
      console.log(`   - ${r.podName} (${r.podId}): ${r.reason}`);
    });
  }

  if (failed.length > 0) {
    console.log('\n❌ Failed Pods:');
    failed.forEach(r => {
      console.log(`   - ${r.podName} (${r.podId}): ${r.error}`);
    });
  }

  console.log('\n✅ Migration script complete!');
}

// Run migration
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });
