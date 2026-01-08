/**
 * CDP Transaction Utilities
 *
 * Encapsulates the correct pattern for sending transactions via CDP Embedded Wallets.
 *
 * CRITICAL ACCOUNT MODEL (discovered via TypeScript types + runtime testing):
 *
 * CDP creates TWO accounts per user:
 * 1. EOA (Externally Owned Account) - from currentUser.evmAccounts[0]
 * 2. Smart Account (Account Abstraction) - from useEvmAddress()
 *
 * CRITICAL REQUIREMENTS:
 *
 * ✅ CORRECT - Use EOA for evmAccount:
 *   const { currentUser } = useCurrentUser();
 *   const eoaAccount = currentUser.evmAccounts[0]; // ← Use this!
 *   sendEvmTransaction({ evmAccount: eoaAccount, ... });
 *
 * ❌ WRONG - Using Smart Account causes "EVM account not found":
 *   const { evmAddress } = useEvmAddress(); // ← This is Smart Account!
 *   sendEvmTransaction({ evmAccount: evmAddress, ... }); // ← FAILS!
 *
 * Transaction Schema (verified against actual SDK types):
 * - 'evmAccount' at top level = EOA address (for authentication)
 * - NO 'from' field in transaction (SDK infers it from evmAccount!)
 * - 'chainId' must be NUMBER not bigint
 * - Use 'gas' not 'gasLimit'
 * - Use 'network' for API routing
 *
 * Based on errors2.txt.txt analysis and TypeScript type definitions
 */

import { encodeFunctionData, Abi } from 'viem';

// Type for CDP transaction params (matches actual SDK types from error messages)
type SendEvmTransactionParams = {
  network: string;
  evmAccount: `0x${string}`;  // CRITICAL: Top-level for CDP API session binding (NOT "address"!)
  transaction: {
    // NOTE: 'from' is NOT allowed in the transaction type - SDK infers it from evmAccount!
    to: `0x${string}`;
    data?: `0x${string}`;
    value?: bigint;
    gas?: bigint;           // Use 'gas' not 'gasLimit'
    chainId: number;        // MUST be number, not bigint!
    type?: 'eip1559';
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  };
};

/**
 * Parameters for sending a contract transaction via CDP
 */
export interface CDPContractTransactionParams {
  /**
   * The sender's EOA address - MUST be from currentUser.evmAccounts[0]
   * NOT from useEvmAddress() (that returns Smart Account and will fail!)
   */
  senderAddress: `0x${string}`;
  /** The contract address to interact with */
  contractAddress: `0x${string}`;
  /** The contract ABI */
  abi: Abi;
  /** The function name to call */
  functionName: string;
  /** Function arguments (if any) */
  args?: readonly unknown[];
  /** ETH value to send (default: 0n) */
  value?: bigint;
  /** Gas limit (default: 300000n) - ignored if using paymaster */
  gasLimit?: bigint;
  /** Max fee per gas in wei (default: 1 gwei) - ignored if using paymaster */
  maxFeePerGas?: bigint;
  /** Max priority fee per gas in wei (default: 0) - ignored if using paymaster */
  maxPriorityFeePerGas?: bigint;
  /** Use gas sponsorship (paymaster) - default: true */
  usePaymaster?: boolean;
}

/**
 * Build a CDP-compatible transaction object for contract calls
 *
 * CORRECTED based on actual SDK type requirements:
 * 1. Encodes function call data using viem
 * 2. evmAccount at top level (CDP authentication layer)
 * 3. NO 'from' in transaction (SDK infers from evmAccount!)
 * 4. chainId must be NUMBER not bigint
 * 5. Uses 'gas' not 'gasLimit'
 * 6. Includes EIP-1559 gas fields
 *
 * @returns Parameters ready for useSendEvmTransaction hook
 */
export function buildCDPTransaction(
  params: CDPContractTransactionParams
): Omit<SendEvmTransactionParams, 'network'> & { network: 'base' } {
  const {
    senderAddress,
    contractAddress,
    abi,
    functionName,
    args = [],
    value = 0n,
    gasLimit = 300000n,
    maxFeePerGas = 1_000_000_000n, // 1 gwei
    maxPriorityFeePerGas = 0n,
  } = params;

  // Encode the contract function call
  const data = encodeFunctionData({
    abi,
    functionName,
    args,
  });

  // Build transaction object matching actual SDK types
  const transaction = {
    to: contractAddress,
    data,
    value,
    gas: gasLimit,           // Use 'gas' not 'gasLimit'
    chainId: 8453,           // MUST be number, not bigint!
    type: 'eip1559' as const,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };

  // Return in CDP API format
  return {
    network: 'base',
    evmAccount: senderAddress,   // SDK infers 'from' from this!
    transaction,
  };
}

/**
 * Type-safe wrapper for common contract write operations
 *
 * Usage (CORRECTED):
 * ```typescript
 * const { currentUser } = useCurrentUser();
 * const { sendEvmTransaction } = useSendEvmTransaction();
 *
 * // CRITICAL: Use EOA from currentUser, NOT evmAddress!
 * const eoaAccount = currentUser.evmAccounts[0];
 *
 * const params = buildCDPTransaction({
 *   senderAddress: eoaAccount, // ← Must be EOA!
 *   contractAddress: '0x...',
 *   abi: MY_ABI,
 *   functionName: 'myFunction',
 *   args: [arg1, arg2],
 * });
 *
 * const result = await sendEvmTransaction(params);
 * ```
 */

/**
 * Helper to validate CDP transaction parameters before sending
 */
export function validateCDPTransactionParams(params: CDPContractTransactionParams): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!params.senderAddress) {
    errors.push('senderAddress is required (use useEvmAddress hook)');
  }

  if (!params.contractAddress) {
    errors.push('contractAddress is required');
  }

  if (!params.abi || params.abi.length === 0) {
    errors.push('abi is required and must not be empty');
  }

  if (!params.functionName) {
    errors.push('functionName is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Common gas configurations for different transaction types
 */
export const CDP_GAS_PRESETS = {
  /** Standard token transfer or simple contract call */
  STANDARD: {
    gasLimit: 300000n,
    maxFeePerGas: 1_000_000_000n, // 1 gwei
    maxPriorityFeePerGas: 0n,
  },
  /** Complex multi-call or batch operations */
  COMPLEX: {
    gasLimit: 500000n,
    maxFeePerGas: 2_000_000_000n, // 2 gwei
    maxPriorityFeePerGas: 0n,
  },
  /** Conservative estimate for unknown operations */
  CONSERVATIVE: {
    gasLimit: 1000000n,
    maxFeePerGas: 5_000_000_000n, // 5 gwei
    maxPriorityFeePerGas: 0n,
  },
} as const;
