// src/components/PaymasterTest.tsx
'use client';
import React from 'react';
import { useAccount } from 'wagmi';
import { Transaction, TransactionButton, TransactionSponsor } from '@coinbase/onchainkit/transaction';

const PaymasterTest: React.FC = () => {
  const { address } = useAccount();

  // Simple test contract call - using a basic ERC20 transfer or similar
  const testContract = {
    address: '0xa3DA6AfAD125eA5b2D11c89b7643a0D5956e7e17' as `0x${string}`, // Your Governor contract
    abi: [
      {
        "inputs": [],
        "name": "name",
        "outputs": [{"internalType": "string", "name": "", "type": "string"}],
        "stateMutability": "view",
        "type": "function"
      }
    ],
    functionName: 'name',
    args: [],
  };

  console.log('=== PAYMASTER TEST DEBUG ===');
  console.log('Connected address:', address);
  console.log('Paymaster URL from env:', process.env.NEXT_PUBLIC_PAYMASTER?.substring(0, 30) + '...');
  console.log('CDP API Key from env:', process.env.NEXT_PUBLIC_CDP_API_CLIENT?.substring(0, 10) + '...');

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-lg shadow-lg">
      <h2 className="text-xl font-bold mb-4">Paymaster Test</h2>
      
      {/* Environment Check */}
      <div className="mb-4 p-3 bg-gray-100 rounded">
        <h3 className="font-medium mb-2">Environment Check:</h3>
        <div className="text-sm space-y-1">
          <div>CDP API Key: {process.env.NEXT_PUBLIC_CDP_API_CLIENT ? '✅ Set' : '❌ Missing'}</div>
          <div>Paymaster URL: {process.env.NEXT_PUBLIC_PAYMASTER ? '✅ Set' : '❌ Missing'}</div>
          <div>Wallet Connected: {address ? '✅ Connected' : '❌ Not Connected'}</div>
        </div>
      </div>

      {/* Test Transaction */}
      <div className="mb-4">
        <h3 className="font-medium mb-2">Paymaster Test Transaction:</h3>
        <p className="text-sm text-gray-600 mb-3">
          This will test if paymaster sponsorship is working by calling a simple view function.
        </p>
        
        <Transaction
          isSponsored={true}
          address={address}
          contracts={[testContract]}
          onSuccess={(receipt) => {
            console.log('✅ PAYMASTER TEST SUCCESS:', receipt);
            alert('Paymaster test successful! Check console for details.');
          }}
          onError={(error) => {
            console.error('❌ PAYMASTER TEST FAILED:', error);
            alert(`Paymaster test failed: ${error.message}`);
          }}
          onTransactionStarted={() => {
            console.log('🚀 PAYMASTER TEST STARTED');
          }}
        >
          <TransactionButton
            text="Test Paymaster"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
          />
          <TransactionSponsor className="mt-2 text-center" />
        </Transaction>
      </div>

      {/* Manual Debug Button */}
      <button
        onClick={() => {
          console.log('=== MANUAL DEBUG ===');
          console.log('Window location:', window.location.href);
          console.log('All env vars:', {
            PAYMASTER_URL: process.env.NEXT_PUBLIC_PAYMASTER,
            CDP_API_KEY: process.env.NEXT_PUBLIC_CDP_API_CLIENT,
            WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
          });
        }}
        className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded"
      >
        Debug Environment
      </button>
    </div>
  );
};

export default PaymasterTest;