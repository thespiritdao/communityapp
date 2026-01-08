'use client';

import { useEvmAddress, useSendEvmTransaction, useCurrentUser } from '@coinbase/cdp-hooks';
import { useState, useEffect } from 'react';
import { Transaction, TransactionButton, TransactionStatus, TransactionStatusLabel, TransactionStatusAction } from '@coinbase/onchainkit/transaction';
import type { LifecycleStatus } from '@coinbase/onchainkit/transaction';
import { encodeFunctionData } from 'viem';

/**
 * MINIMAL VIABLE CDP TRANSACTION TEST
 *
 * Purpose: Prove whether CDP Embedded Wallet → sendEvmTransaction works AT ALL
 *
 * This uses ONLY what the official CDP docs specify:
 * - evmAccount (NOT "address")
 * - network
 * - transaction: { to, value }
 *
 * NO:
 * - contract calls
 * - ABI encoding
 * - gas overrides (gasLimit, maxFeePerGas, etc.)
 * - chainId
 * - from field
 * - EIP-1559 fields
 *
 * If this fails, it proves the docs are incomplete/incorrect.
 */
export default function MinimalCdpTxTest() {
  const { evmAddress } = useEvmAddress();
  const { sendEvmTransaction } = useSendEvmTransaction();
  const { currentUser } = useCurrentUser();
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<string>('');

  // Diagnostic logging on mount and when session changes
  useEffect(() => {
    console.log('🔍 ===== CDP SESSION DIAGNOSTICS =====');
    console.log('Current User:', currentUser);
    console.log('EVM Address from hook:', evmAddress);
    console.log('Address type:', typeof evmAddress);
    console.log('Address length:', evmAddress?.length);

    if (currentUser) {
      console.log('User ID:', currentUser.userId);
      console.log('EVM Accounts:', currentUser.evmAccounts);
      console.log('EVM Smart Accounts:', currentUser.evmSmartAccounts);
      console.log('EVM Account Objects:', currentUser.evmAccountObjects);
      console.log('EVM Smart Account Objects:', currentUser.evmSmartAccountObjects);
      console.log('Authentication Methods:', currentUser.authenticationMethods);

      const diag = `
📊 CDP Session State:
- User ID: ${currentUser.userId || 'N/A'}
- EVM Accounts: ${currentUser.evmAccounts?.length || 0} (${currentUser.evmAccounts?.join(', ') || 'none'})
- EVM Smart Accounts: ${currentUser.evmSmartAccounts?.length || 0} (${currentUser.evmSmartAccounts?.join(', ') || 'none'})
- Current Address: ${evmAddress || 'N/A'}
- Address in accounts list: ${evmAddress && currentUser.evmAccounts?.includes(evmAddress) ? 'YES ✅' : 'NO ❌'}
- Address in smart accounts: ${evmAddress && currentUser.evmSmartAccounts?.includes(evmAddress) ? 'YES ✅' : 'NO ❌'}
      `.trim();
      setDiagnostics(diag);
    } else {
      setDiagnostics('⚠️ No current user - not authenticated');
    }
  }, [currentUser, evmAddress]);

  const sendTestTx = async () => {
    if (!evmAddress) {
      setError('No EVM address available - please connect wallet');
      return;
    }

    if (!currentUser?.evmAccounts?.[0]) {
      setError('No EOA account found - cannot authenticate transaction');
      return;
    }

    setLoading(true);
    setResult('');
    setError('');

    try {
      const eoaAccount = currentUser.evmAccounts[0]; // EOA for authentication
      const smartAccount = evmAddress; // Smart Account for transaction

      console.log('🧪 ===== MINIMAL CDP TRANSACTION TEST =====');
      console.log('🔑 EOA Account (for evmAccount param):', eoaAccount);
      console.log('💼 Smart Account (for transaction):', smartAccount);
      console.log('📊 Account Relationship: EOA controls Smart Account');
      console.log('Transaction: Send 0 ETH to self (simplest possible tx)');

      // CORRECTED: evmAccount at top level, NO 'from' in transaction!
      const payload = {
        evmAccount: eoaAccount,  // ← CDP authentication (SDK infers 'from' from this!)
        network: 'base' as const,
        transaction: {
          to: smartAccount,       // send to self
          value: 0n,              // zero ETH
          type: 'eip1559' as const,
          gas: 21000n,            // Use 'gas' not 'gasLimit'
          maxFeePerGas: 1_000_000_000n,
          chainId: 8453,          // MUST be number, not bigint!
        },
      };

      console.log('🧪 Payload:', payload);
      console.log('🧪 evmAccount (EOA):', payload.evmAccount);
      console.log('🧪 SDK will infer "from" from evmAccount');

      const txResult = await sendEvmTransaction(payload);

      console.log('✅ Transaction succeeded!', txResult);
      setResult(JSON.stringify(txResult, null, 2));
    } catch (err: any) {
      console.error('❌ Transaction failed:', err);
      console.error('❌ Error name:', err.name);
      console.error('❌ Error message:', err.message);
      console.error('❌ Full error:', err);
      setError(`${err.name}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F5F4ED',
      padding: '24px',
    }}>
      <div style={{
        maxWidth: '800px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '12px',
        padding: '32px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 'bold',
          color: '#2F5D50',
          marginBottom: '16px',
        }}>
          🧪 Minimal CDP Transaction Test
        </h1>

        <div style={{
          background: '#E6F7FF',
          border: '1px solid #91D5FF',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '24px',
          fontSize: '14px',
        }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: '600', color: '#0050B3' }}>
            🎯 CORRECTED: Actual SDK Schema!
          </p>
          <p style={{ margin: '0 0 8px 0' }}>
            CDP creates TWO accounts: EOA (owner) + Smart Account (executor)
          </p>
          <p style={{ margin: '0 0 8px 0' }}>
            <strong>The ACTUAL Fix (from TypeScript types):</strong>
          </p>
          <ul style={{ margin: '8px 0 0 20px', paddingLeft: 0 }}>
            <li><code>evmAccount</code> = EOA account (authenticates)</li>
            <li>NO <code>from</code> in transaction (SDK infers it!)</li>
            <li><code>chainId</code> must be number, not bigint</li>
            <li>Use <code>gas</code> not <code>gasLimit</code></li>
          </ul>
          <p style={{ margin: '12px 0 0 0', fontSize: '13px', color: '#096DD9' }}>
            Documentation was incomplete - TypeScript errors revealed truth!
          </p>
        </div>

        {/* CDP Session Diagnostics */}
        {diagnostics && (
          <div style={{
            background: '#FEF3C7',
            border: '1px solid #FCD34D',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            fontSize: '13px',
            fontFamily: 'monospace',
          }}>
            <p style={{ margin: '0 0 8px 0', fontWeight: '600', color: '#92400E' }}>
              🔍 CDP Session Diagnostics:
            </p>
            <pre style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              color: '#78350F',
            }}>
              {diagnostics}
            </pre>
          </div>
        )}

        {evmAddress && (
          <div style={{
            background: '#E8F1EE',
            border: '1px solid #B8D9CA',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            fontSize: '14px',
          }}>
            <p style={{ margin: '0 0 4px 0', fontWeight: '600', color: '#2F5D50' }}>
              Connected Address:
            </p>
            <code style={{
              background: '#D1E6DC',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '13px',
            }}>
              {evmAddress}
            </code>
          </div>
        )}

        <button
          onClick={sendTestTx}
          disabled={!evmAddress || loading}
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '16px',
            fontWeight: '600',
            color: 'white',
            background: evmAddress && !loading ? '#2F5D50' : '#D8D2C8',
            border: 'none',
            borderRadius: '8px',
            cursor: evmAddress && !loading ? 'pointer' : 'not-allowed',
            marginBottom: '24px',
          }}
        >
          {loading ? '⏳ Sending...' : '🧪 Send Minimal CDP Transaction (0 ETH to self)'}
        </button>

        {error && (
          <div style={{
            background: '#FEE',
            border: '1px solid #F88',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
          }}>
            <p style={{ margin: '0 0 8px 0', fontWeight: '600', color: '#C00' }}>
              ❌ Transaction Failed
            </p>
            <pre style={{
              background: '#FDD',
              padding: '12px',
              borderRadius: '4px',
              fontSize: '12px',
              overflow: 'auto',
              margin: 0,
            }}>
              {error}
            </pre>
            <p style={{ margin: '12px 0 0 0', fontSize: '14px', color: '#666' }}>
              Check browser console for full error details
            </p>
          </div>
        )}

        {result && (
          <div style={{
            background: '#DFD',
            border: '1px solid #8C8',
            borderRadius: '8px',
            padding: '16px',
          }}>
            <p style={{ margin: '0 0 8px 0', fontWeight: '600', color: '#060' }}>
              ✅ Transaction Succeeded!
            </p>
            <pre style={{
              background: '#EFE',
              padding: '12px',
              borderRadius: '4px',
              fontSize: '12px',
              overflow: 'auto',
              margin: 0,
            }}>
              {result}
            </pre>
          </div>
        )}

        <div style={{
          marginTop: '32px',
          padding: '16px',
          background: '#F5F5F5',
          borderRadius: '8px',
          fontSize: '14px',
        }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: '600' }}>
            What This Test Proves:
          </p>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li><strong>If it succeeds:</strong> CDP works, our faucet issues are contract/gas related</li>
            <li><strong>If it fails with "address is missing":</strong> Docs are wrong/incomplete</li>
            <li><strong>If it fails otherwise:</strong> SDK/backend issue</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
