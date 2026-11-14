/**
 * Transaction Debugger Utility
 *
 * Helps debug OnChainKit transaction formatting issues
 */

export interface TransactionCall {
  address: string; // OnChainKit uses 'address' not 'to'
  abi: any[];
  functionName: string;
  args: any[];
}

/**
 * Validate OnChainKit transaction calls format
 */
export function validateTransactionCalls(calls: TransactionCall[]): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!calls || !Array.isArray(calls)) {
    errors.push('Calls must be an array');
    return { valid: false, errors, warnings };
  }

  if (calls.length === 0) {
    errors.push('Calls array cannot be empty');
    return { valid: false, errors, warnings };
  }

  calls.forEach((call, index) => {
    const prefix = `Call ${index}:`;

    // Check required fields
    if (!call.address) {
      errors.push(`${prefix} 'address' field is required`);
    }

    if (!call.abi) {
      errors.push(`${prefix} 'abi' field is required`);
    }

    if (!call.functionName) {
      errors.push(`${prefix} 'functionName' field is required`);
    }

    // Validate address format
    if (call.address && !isValidAddress(call.address)) {
      errors.push(
        `${prefix} 'address' must be a valid Ethereum address (got: ${call.address})`,
      );
    }

    // Validate ABI format
    if (call.abi && !Array.isArray(call.abi)) {
      errors.push(`${prefix} 'abi' must be an array`);
    }

    // Check if function exists in ABI
    if (call.abi && Array.isArray(call.abi) && call.functionName) {
      const functionExists = call.abi.some(
        (item: any) =>
          item.name === call.functionName && item.type === 'function',
      );

      if (!functionExists) {
        errors.push(
          `${prefix} Function '${call.functionName}' not found in ABI`,
        );
      }
    }

    // Validate args
    if (!call.args) {
      warnings.push(
        `${prefix} 'args' field is missing (use empty array if no args)`,
      );
    } else if (!Array.isArray(call.args)) {
      errors.push(`${prefix} 'args' must be an array`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Debug transaction calls with detailed logging
 */
export function debugTransactionCalls(
  calls: TransactionCall[],
  context = 'Transaction',
) {
  console.log(`🐛 ${context} Debug:`);

  // Use custom replacer to handle BigInt serialization
  const replacer = (_key: string, value: any) => {
    if (typeof value === 'bigint') {
      return value.toString() + 'n';
    }
    return value;
  };

  console.log('📄 Raw calls object:', JSON.stringify(calls, replacer, 2));

  const validation = validateTransactionCalls(calls);

  console.log('✅ Validation Results:');
  console.log(`   Valid: ${validation.valid}`);

  if (validation.errors.length > 0) {
    console.log('❌ Errors:');
    validation.errors.forEach((error) => console.log(`   - ${error}`));
  }

  if (validation.warnings.length > 0) {
    console.log('⚠️ Warnings:');
    validation.warnings.forEach((warning) => console.log(`   - ${warning}`));
  }

  // Detailed call analysis
  calls.forEach((call, index) => {
    console.log(`🔍 Call ${index} Analysis:`);
    console.log(`   address: ${call.address} (${typeof call.address})`);
    console.log(
      `   abi: ${Array.isArray(call.abi) ? `Array(${call.abi.length})` : typeof call.abi}`,
    );
    console.log(
      `   functionName: ${call.functionName} (${typeof call.functionName})`,
    );
    console.log(
      `   args: ${Array.isArray(call.args) ? `Array(${call.args.length})` : typeof call.args}`,
    );

    if (call.args && Array.isArray(call.args)) {
      call.args.forEach((arg, argIndex) => {
        console.log(`     args[${argIndex}]: ${arg} (${typeof arg})`);
      });
    }
  });

  return validation;
}

/**
 * Simple Ethereum address validation
 */
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Create a properly formatted OnChainKit transaction call
 */
export function createTransactionCall(
  contractAddress: string,
  abi: any[],
  functionName: string,
  args: any[] = [],
): TransactionCall {
  const call: TransactionCall = {
    address: contractAddress, // Fixed: use 'address'
    abi,
    functionName,
    args,
  };

  console.log('🏗️ Created transaction call:');
  debugTransactionCalls([call], 'Creation');

  return call;
}

/**
 * Test transaction call creation with mock data
 */
export function testTransactionCallCreation() {
  console.log('🧪 Testing transaction call creation...');

  const mockABI = [
    {
      name: 'testFunction',
      type: 'function',
      inputs: [{ name: 'param1', type: 'string' }],
      outputs: [],
      stateMutability: 'nonpayable',
    },
  ];

  const testCall = createTransactionCall(
    '0x0000000000000000000000000000000000000001',
    mockABI,
    'testFunction',
    ['test-parameter'],
  );

  console.log('✅ Test call created successfully');
  return testCall;
}
