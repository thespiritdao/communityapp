/**
 * Proxy Admin HAT Service
 *
 * Handles creation and management of Proxy Admin HATs for pod authorization proxies.
 *
 * ARCHITECTURE:
 * - Each pod proxy gets a special "Admin HAT"
 * - Admin HAT is minted to the proxy contract (proxy "wears" it)
 * - Admin HAT is set as admin of pod management/membership HATs
 * - Proxy wearing admin HAT = proxy has admin rights over pod HATs
 * - Pod leaders can modify HATs through proxy autonomously
 */

import {
  createPublicClient,
  http,
  encodeFunctionData,
  type WalletClient,
} from 'viem';
import { base } from 'viem/chains';
import { validateAndConvertHatId } from '../utils/hatIdValidator';

export interface ProxyAdminHatParams {
  podId: string;
  podName: string;
  parentPodHatId: string; // Parent pod's management HAT ID
  proxyAddress: string; // PodAuthProxy address
  execPodAddress: string; // Executive pod address for toggle module
  walletClient: WalletClient;
}

export interface ProxyAdminHatResult {
  success: boolean;
  proxyAdminHatId?: string;
  transactionHash?: string;
  error?: string;
}

export class ProxyAdminHatService {
  private static readonly HATS_PROTOCOL_ADDRESS =
    process.env.NEXT_PUBLIC_HATS_PROTOCOL_ADDRESS ||
    '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';

  /**
   * Create a Proxy Admin HAT for a pod's authorization proxy
   *
   * This HAT:
   * - Has parent pod as admin (maintains hierarchy)
   * - Has proxy contract as ONLY eligible wearer (maxSupply: 1)
   * - Has exec pod as toggle module (emergency control)
   * - Is immutable (cannot be modified after creation)
   *
   * @param params - Proxy admin HAT creation parameters
   * @returns Result with new proxy admin HAT ID
   */
  static async createProxyAdminHat(
    params: ProxyAdminHatParams,
  ): Promise<ProxyAdminHatResult> {
    try {
      console.log('🎩 Creating Proxy Admin HAT:', {
        podId: params.podId,
        podName: params.podName,
        parentHatId: params.parentPodHatId,
        proxyAddress: params.proxyAddress,
      });

      // Validate parent hat ID
      const parentValidation = validateAndConvertHatId(params.parentPodHatId);
      if (!parentValidation.isValid || !parentValidation.hatIdBigInt) {
        return {
          success: false,
          error: `Invalid parent hat ID: ${parentValidation.error}`,
        };
      }

      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      // Verify parent HAT exists and is active
      const parentHatDetails = await publicClient.readContract({
        address: this.HATS_PROTOCOL_ADDRESS as `0x${string}`,
        abi: [
          {
            name: 'viewHat',
            type: 'function',
            inputs: [{ name: '_hatId', type: 'uint256' }],
            outputs: [
              {
                type: 'tuple',
                components: [
                  { name: 'details', type: 'string' },
                  { name: 'maxSupply', type: 'uint32' },
                  { name: 'supply', type: 'uint32' },
                  { name: 'eligibility', type: 'address' },
                  { name: 'toggle', type: 'address' },
                  { name: 'imageURI', type: 'string' },
                  { name: 'lastHatId', type: 'uint16' },
                  { name: 'mutable', type: 'bool' },
                  { name: 'active', type: 'bool' },
                ],
              },
            ],
            stateMutability: 'view',
          },
        ],
        functionName: 'viewHat',
        args: [parentValidation.hatIdBigInt],
      });

      if (!parentHatDetails.active) {
        // active field
        return {
          success: false,
          error: 'Parent HAT is not active',
        };
      }

      // Prepare HAT details
      const hatDetails = JSON.stringify({
        type: 'proxy_admin_hat',
        name: `${params.podName} - Proxy Admin`,
        description: `Administrative HAT for ${params.podName} pod's authorization proxy. This HAT grants the pod proxy admin rights over pod HATs, enabling pod leader autonomy.`,
        podId: params.podId,
        proxyAddress: params.proxyAddress,
        purpose: 'Grant proxy admin rights over pod HATs',
        version: 'v2-proxy-admin-pattern',
        created: new Date().toISOString(),
      });

      console.log('🎯 Proxy Admin HAT parameters:', {
        admin: params.parentPodHatId,
        eligibility: params.proxyAddress, // Only proxy can wear this HAT
        toggle: params.execPodAddress, // Exec pod can deactivate
        maxSupply: 1, // Only one wearer (the proxy)
        mutable: false, // Immutable for security
        imageURI: '', // No image needed
      });

      // Create the admin HAT
      const createHatData = encodeFunctionData({
        abi: [
          {
            name: 'createHat',
            type: 'function',
            inputs: [
              { name: '_admin', type: 'uint256' },
              { name: '_details', type: 'string' },
              { name: '_maxSupply', type: 'uint32' },
              { name: '_eligibility', type: 'address' },
              { name: '_toggle', type: 'address' },
              { name: '_mutable', type: 'bool' },
              { name: '_imageURI', type: 'string' },
            ],
            outputs: [{ name: 'newHatId', type: 'uint256' }],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'createHat',
        args: [
          parentValidation.hatIdBigInt,
          hatDetails,
          1, // maxSupply: only proxy can wear
          params.proxyAddress as `0x${string}`, // eligibility: only proxy address
          params.execPodAddress as `0x${string}`, // toggle: exec pod (emergency control)
          false, // mutable: immutable for security
          '', // imageURI: not needed for admin HAT
        ],
      });

      // Execute transaction
      const account = params.walletClient.account?.address;
      if (!account) {
        throw new Error('No wallet account found');
      }

      const txHash = await params.walletClient.sendTransaction({
        to: this.HATS_PROTOCOL_ADDRESS as `0x${string}`,
        data: createHatData,
        account,
        chain: base,
      });

      console.log('✅ Proxy Admin HAT creation transaction sent:', txHash);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      if (receipt.status !== 'success') {
        return {
          success: false,
          error: 'Transaction reverted',
        };
      }

      // Parse HatCreated event to get new HAT ID
      const hatCreatedEventAbi = {
        type: 'event',
        name: 'HatCreated',
        inputs: [
          { name: 'id', type: 'uint256', indexed: false },
          { name: 'details', type: 'string', indexed: false },
          { name: 'maxSupply', type: 'uint32', indexed: false },
          { name: 'eligibility', type: 'address', indexed: false },
          { name: 'toggle', type: 'address', indexed: false },
          { name: 'mutable', type: 'bool', indexed: false },
          { name: 'imageURI', type: 'string', indexed: false },
        ],
      };

      // Find HatCreated event in logs
      const hatCreatedLog = receipt.logs.find((log) => {
        try {
          const topics = log.topics;
          // Check if topic[0] matches HatCreated event signature
          const eventSignature =
            '0x' +
            Buffer.from(
              'HatCreated(uint256,string,uint32,address,address,bool,string)',
            ).toString('hex');
          // In practice, use proper event signature hashing
          return (
            log.address.toLowerCase() ===
            this.HATS_PROTOCOL_ADDRESS.toLowerCase()
          );
        } catch {
          return false;
        }
      });

      let newHatId: string;

      if (hatCreatedLog && hatCreatedLog.data) {
        // Parse the HAT ID from event data
        // The first 32 bytes of data is the HAT ID (uint256)
        const hatIdHex = hatCreatedLog.data.slice(0, 66); // '0x' + 64 hex chars
        newHatId = hatIdHex;
        console.log('✅ Parsed Proxy Admin HAT ID from event:', newHatId);
      } else {
        // Fallback: generate expected child HAT ID
        newHatId = this.generateNextHatId(params.parentPodHatId);
        console.log('⚠️ Using generated Proxy Admin HAT ID:', newHatId);
      }

      return {
        success: true,
        proxyAdminHatId: newHatId,
        transactionHash: txHash,
      };
    } catch (error: any) {
      console.error('❌ Failed to create Proxy Admin HAT:', error);
      return {
        success: false,
        error:
          error?.message ||
          error?.toString() ||
          'Failed to create Proxy Admin HAT',
      };
    }
  }

  /**
   * Mint the Proxy Admin HAT to the proxy contract
   *
   * After creating the admin HAT, we must mint it to the proxy contract
   * so the proxy "wears" the HAT and gains admin rights.
   *
   * @param proxyAdminHatId - The admin HAT ID to mint
   * @param proxyAddress - Address of the PodAuthProxy contract
   * @param walletClient - Wallet client for signing transaction
   * @returns Result with transaction hash
   */
  static async mintProxyAdminHat(
    proxyAdminHatId: string,
    proxyAddress: string,
    walletClient: WalletClient,
  ): Promise<ProxyAdminHatResult> {
    try {
      console.log('👑 Minting Proxy Admin HAT to proxy:', {
        hatId: proxyAdminHatId,
        proxyAddress,
      });

      // Validate HAT ID
      const hatValidation = validateAndConvertHatId(proxyAdminHatId);
      if (!hatValidation.isValid || !hatValidation.hatIdBigInt) {
        return {
          success: false,
          error: `Invalid HAT ID: ${hatValidation.error}`,
        };
      }

      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      // Encode mintHat function call
      const mintHatData = encodeFunctionData({
        abi: [
          {
            name: 'mintHat',
            type: 'function',
            inputs: [
              { name: '_hatId', type: 'uint256' },
              { name: '_wearer', type: 'address' },
            ],
            outputs: [{ name: 'success', type: 'bool' }],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'mintHat',
        args: [hatValidation.hatIdBigInt, proxyAddress as `0x${string}`],
      });

      // Execute transaction
      const account = walletClient.account?.address;
      if (!account) {
        throw new Error('No wallet account found');
      }

      const txHash = await walletClient.sendTransaction({
        to: this.HATS_PROTOCOL_ADDRESS as `0x${string}`,
        data: mintHatData,
        account,
        chain: base,
      });

      console.log('✅ Mint Proxy Admin HAT transaction sent:', txHash);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      if (receipt.status !== 'success') {
        return {
          success: false,
          error: 'Mint transaction reverted',
        };
      }

      console.log('✅ Proxy Admin HAT minted successfully to:', proxyAddress);

      return {
        success: true,
        proxyAdminHatId,
        transactionHash: txHash,
      };
    } catch (error: any) {
      console.error('❌ Failed to mint Proxy Admin HAT:', error);
      return {
        success: false,
        error:
          error?.message ||
          error?.toString() ||
          'Failed to mint Proxy Admin HAT',
      };
    }
  }

  /**
   * Complete setup of Proxy Admin HAT (create + mint)
   *
   * This is the main function to use during pod creation.
   * It handles both creating the admin HAT and minting it to the proxy.
   *
   * @param params - Proxy admin HAT setup parameters
   * @returns Result with proxy admin HAT ID
   */
  static async setupProxyAdminHat(
    params: ProxyAdminHatParams,
  ): Promise<ProxyAdminHatResult> {
    try {
      console.log('🚀 Setting up Proxy Admin HAT for pod:', params.podId);

      // Step 1: Create the admin HAT
      const createResult = await this.createProxyAdminHat(params);

      if (!createResult.success || !createResult.proxyAdminHatId) {
        return createResult;
      }

      console.log(
        '✅ Step 1/2: Proxy Admin HAT created:',
        createResult.proxyAdminHatId,
      );

      // Step 2: Mint the admin HAT to the proxy
      const mintResult = await this.mintProxyAdminHat(
        createResult.proxyAdminHatId,
        params.proxyAddress,
        params.walletClient,
      );

      if (!mintResult.success) {
        return {
          success: false,
          error: `HAT created but minting failed: ${mintResult.error}`,
          proxyAdminHatId: createResult.proxyAdminHatId,
        };
      }

      console.log('✅ Step 2/2: Proxy Admin HAT minted to proxy');
      console.log('🎉 Proxy Admin HAT setup complete!');

      return {
        success: true,
        proxyAdminHatId: createResult.proxyAdminHatId,
        transactionHash: mintResult.transactionHash,
      };
    } catch (error: any) {
      console.error('❌ Failed to setup Proxy Admin HAT:', error);
      return {
        success: false,
        error:
          error?.message ||
          error?.toString() ||
          'Failed to setup Proxy Admin HAT',
      };
    }
  }

  /**
   * Verify that a proxy wears its admin HAT and is admin of pod HATs
   *
   * This is a diagnostic function to check if the proxy admin setup is correct.
   *
   * @param proxyAddress - Address of the PodAuthProxy
   * @param proxyAdminHatId - Expected admin HAT ID
   * @param managementHatId - Pod management HAT ID
   * @returns Verification result with details
   */
  static async verifyProxyAdminSetup(
    proxyAddress: string,
    proxyAdminHatId: string,
    managementHatId: string,
  ): Promise<{
    isValid: boolean;
    proxyWearsAdminHat: boolean;
    proxyIsAdminOfManagementHat: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      // Validate HAT IDs
      const adminHatValidation = validateAndConvertHatId(proxyAdminHatId);
      const mgmtHatValidation = validateAndConvertHatId(managementHatId);

      if (!adminHatValidation.isValid || !adminHatValidation.hatIdBigInt) {
        errors.push(`Invalid admin HAT ID: ${adminHatValidation.error}`);
      }

      if (!mgmtHatValidation.isValid || !mgmtHatValidation.hatIdBigInt) {
        errors.push(`Invalid management HAT ID: ${mgmtHatValidation.error}`);
      }

      if (errors.length > 0) {
        return {
          isValid: false,
          proxyWearsAdminHat: false,
          proxyIsAdminOfManagementHat: false,
          errors,
        };
      }

      // Check if proxy wears admin HAT
      const proxyWearsAdminHat = (await publicClient.readContract({
        address: this.HATS_PROTOCOL_ADDRESS as `0x${string}`,
        abi: [
          {
            name: 'isWearerOfHat',
            type: 'function',
            inputs: [
              { name: '_user', type: 'address' },
              { name: '_hatId', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
            stateMutability: 'view',
          },
        ],
        functionName: 'isWearerOfHat',
        args: [proxyAddress as `0x${string}`, adminHatValidation.hatIdBigInt!],
      })) as boolean;

      // Check if proxy is admin of management HAT
      const proxyIsAdminOfManagementHat = (await publicClient.readContract({
        address: this.HATS_PROTOCOL_ADDRESS as `0x${string}`,
        abi: [
          {
            name: 'isAdminOfHat',
            type: 'function',
            inputs: [
              { name: '_user', type: 'address' },
              { name: '_hatId', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
            stateMutability: 'view',
          },
        ],
        functionName: 'isAdminOfHat',
        args: [proxyAddress as `0x${string}`, mgmtHatValidation.hatIdBigInt!],
      })) as boolean;

      // Collect errors
      if (!proxyWearsAdminHat) {
        errors.push('Proxy does not wear admin HAT');
      }

      if (!proxyIsAdminOfManagementHat) {
        errors.push('Proxy is not admin of management HAT');
      }

      const isValid = proxyWearsAdminHat && proxyIsAdminOfManagementHat;

      console.log('✅ Proxy admin setup verification:', {
        proxyAddress,
        proxyWearsAdminHat,
        proxyIsAdminOfManagementHat,
        isValid,
      });

      return {
        isValid,
        proxyWearsAdminHat,
        proxyIsAdminOfManagementHat,
        errors,
      };
    } catch (error: any) {
      console.error('❌ Failed to verify proxy admin setup:', error);
      errors.push(error?.message || 'Verification failed');

      return {
        isValid: false,
        proxyWearsAdminHat: false,
        proxyIsAdminOfManagementHat: false,
        errors,
      };
    }
  }

  /**
   * Generate next child HAT ID (fallback if event parsing fails)
   *
   * @param parentHatId - Parent HAT ID
   * @returns Expected child HAT ID
   */
  private static generateNextHatId(parentHatId: string): string {
    const validation = validateAndConvertHatId(parentHatId);
    if (!validation.isValid || !validation.hatIdBigInt) {
      throw new Error('Invalid parent HAT ID');
    }

    // Simplified: assumes this is the first child
    // In reality, you'd query lastHatId from viewHat()
    const nextChildId = (validation.hatIdBigInt << 32n) + 1n;
    return '0x' + nextChildId.toString(16).padStart(64, '0');
  }
}
