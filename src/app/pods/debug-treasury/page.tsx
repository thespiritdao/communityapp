'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';
import {
  debugTransactionCalls,
  testTransactionCallCreation,
} from '@/features/pods/utils/transactionDebugger';

// Contract configuration
const POD_CREATION_MANAGER_ADDRESS = (process.env
  .NEXT_PUBLIC_POD_CREATION_MANAGER ||
  '0x43C124Df0dFb324CCC742808D9FdF62C764f2644') as `0x${string}`;

// Simple ABI for testing
const TEST_ABI = [
  {
    name: 'activatePod',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

export default function DebugTreasuryPage() {
  const { address } = useAccount();
  const [debugOutput, setDebugOutput] = useState<string>('');

  const runDebugTests = () => {
    console.log('🧪 Starting transaction debug tests...');

    let output = '=== TRANSACTION DEBUG TESTS ===\n\n';

    // Test 1: Environment variables
    output += '1. ENVIRONMENT CHECK:\n';
    output += `   POD_CREATION_MANAGER_ADDRESS: ${POD_CREATION_MANAGER_ADDRESS}\n`;
    output += `   Connected Address: ${address || 'Not connected'}\n`;
    output += `   Chain ID: 8453 (Base)\n\n`;

    // Test 2: Basic transaction call creation
    output += '2. TRANSACTION CALL CREATION:\n';
    try {
      const testCall = testTransactionCallCreation();
      output += `   ✅ Test call created successfully\n`;
      output += `   Contract: ${testCall.address}\n`;
      output += `   Function: ${testCall.functionName}\n`;
      output += `   Args: ${JSON.stringify(testCall.args)}\n\n`;
    } catch (error) {
      output += `   ❌ Test call creation failed: ${error}\n\n`;
    }

    // Test 3: Real treasury deployment call
    output += '3. REAL TREASURY CALL:\n';
    try {
      const realCall = {
        address: POD_CREATION_MANAGER_ADDRESS, // ✅ Fixed: use 'address' not 'to'
        abi: TEST_ABI,
        functionName: 'activatePod',
        args: ['executive-pod'],
      };

      const validation = debugTransactionCalls(
        [realCall],
        'Real Treasury Call',
      );
      output += `   Validation Result: ${validation.valid ? '✅ VALID' : '❌ INVALID'}\n`;

      if (validation.errors.length > 0) {
        output += `   Errors: ${validation.errors.join(', ')}\n`;
      }

      if (validation.warnings.length > 0) {
        output += `   Warnings: ${validation.warnings.join(', ')}\n`;
      }

      output += `   Call Structure:\n`;
      output += `     address: "${realCall.address}"\n`;
      output += `     abi: Array(${realCall.abi.length})\n`;
      output += `     functionName: "${realCall.functionName}"\n`;
      output += `     args: [${realCall.args.map((arg) => `"${arg}"`).join(', ')}]\n\n`;
    } catch (error) {
      output += `   ❌ Real call creation failed: ${error}\n\n`;
    }

    setDebugOutput(output);
    console.log(output);
  };

  const prepareTreasuryCall = () => {
    console.log('🏦 Preparing treasury call with full debugging...');

    const calls = [
      {
        address: POD_CREATION_MANAGER_ADDRESS, // ✅ Fixed: use 'address' not 'to'
        abi: TEST_ABI,
        functionName: 'activatePod',
        args: ['executive-pod'],
      },
    ];

    console.log('📊 Final call structure being sent to OnChainKit:');
    console.log(JSON.stringify(calls, null, 2));

    return calls;
  };

  const handleSuccess = (response: any) => {
    console.log('✅ Transaction successful:', response);
  };

  const handleError = (error: any) => {
    console.error('❌ Transaction failed:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      data: error.data,
    });
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle>🐛 Treasury Transaction Debugger</CardTitle>
          <p className="text-sm text-gray-600">
            Debug OnChainKit transaction formatting issues
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Debug Tests */}
          <div>
            <Button onClick={runDebugTests} className="mb-4">
              Run Debug Tests
            </Button>

            {debugOutput && (
              <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap">
                {debugOutput}
              </pre>
            )}
          </div>

          {/* Environment Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Environment Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Contract Address:</strong>
                  <br />
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                    {POD_CREATION_MANAGER_ADDRESS}
                  </code>
                </div>
                <div>
                  <strong>Connected Address:</strong>
                  <br />
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                    {address || 'Not connected'}
                  </code>
                </div>
                <div>
                  <strong>Chain ID:</strong>
                  <br />
                  <span>8453 (Base)</span>
                </div>
                <div>
                  <strong>Sponsored:</strong>
                  <br />
                  <span>✅ Yes</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Test Transaction */}
          {address && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Test Transaction</CardTitle>
                <p className="text-sm text-gray-600">
                  Test the exact transaction format that's failing
                </p>
              </CardHeader>
              <CardContent>
                <Transaction
                  chainId={8453}
                  calls={prepareTreasuryCall()}
                  isSponsored={true}
                  onSuccess={handleSuccess}
                  onError={handleError}
                >
                  <TransactionButton
                    text="Test Treasury Deployment"
                    style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
                  />
                  <TransactionSponsor />
                  <TransactionStatus>
                    <TransactionStatusLabel />
                    <TransactionStatusAction />
                  </TransactionStatus>
                </Transaction>
              </CardContent>
            </Card>
          )}

          {/* Console Output Note */}
          <div className="bg-[#E8F1EE] border border-[#2F5D50] p-4 rounded-lg">
            <h4 className="font-medium text-[#2F5D50] mb-2">📝 Debug Output</h4>
            <p className="text-sm text-[#3A3A3A]">
              Check the browser console for detailed debug information. This
              page will help identify the exact issue with the transaction
              formatting.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
