// Enhanced PaymasterTest with proper connection state handling
'use client';
import React, { useEffect, useState } from 'react';
import { useAccount, useChainId, useConnectors } from 'wagmi';
import { 
  Transaction, 
  TransactionButton, 
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
} from '@coinbase/onchainkit/transaction';
import { base } from 'viem/chains';

const PaymasterTest: React.FC = () => {
  const { address, isConnected, connector, isConnecting } = useAccount();
  const connectors = useConnectors();
  const chainId = useChainId();
  const [isSmartWallet, setIsSmartWallet] = useState(false);
  const [isCheckingWallet, setIsCheckingWallet] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Handle client-side mounting
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Smart wallet detection (similar to your page.tsx logic)
  useEffect(() => {
    const checkSmartWallet = async () => {
      if (address && connector && isConnected) {
        setIsCheckingWallet(true);
        try {
          console.log('=== SMART WALLET CHECK ===');
          console.log('Checking wallet type:', {
            connectorName: connector.name,
            connectorId: connector.id,
            connectorType: connector.type,
            address: address
          });

          const isCoinbaseConnector = connector.name === 'Coinbase Wallet' || 
                                     connector.id === 'coinbaseWallet' ||
                                     connector.id === 'coinbaseWalletSDK';

          if (isCoinbaseConnector) {
            let provider = null;
            
            if (typeof connector.getProvider === 'function') {
              try {
                provider = await connector.getProvider();
              } catch (error) {
                console.log('getProvider method failed:', error);
              }
            }
            
            if (!provider && connector.provider) {
              provider = connector.provider;
            }

            if (provider) {
              console.log('Provider found:', {
                isCoinbaseWallet: provider.isCoinbaseWallet,
                isSmartWallet: provider.isSmartWallet,
                selectedProvider: provider.selectedProvider,
                qrUrl: provider.qrUrl
              });

              // Check contract code at address
              try {
                const code = await provider.request({
                  method: 'eth_getCode',
                  params: [address, 'latest']
                });
                
                const hasContractCode = code && code !== '0x' && code !== '0x0';
                console.log('Contract code check:', { address, code: code?.substring(0, 20) + '...', hasContractCode });
                
                setIsSmartWallet(hasContractCode);
                return;
              } catch (error) {
                console.log('Contract code check failed:', error);
                setIsSmartWallet(false);
                return;
              }
            }
          }
          
          setIsSmartWallet(false);
        } catch (error) {
          console.error('Error checking wallet type:', error);
          setIsSmartWallet(false);
        } finally {
          setIsCheckingWallet(false);
        }
      } else {
        setIsSmartWallet(false);
        setIsCheckingWallet(false);
      }
    };

    checkSmartWallet();
  }, [address, connector, isConnected]);

  // Very simple transaction - send 1 wei to yourself
  const testTransaction = {
    to: address as `0x${string}`,
    value: BigInt(1), // 1 wei
    data: '0x' as `0x${string}`,
  };

  // Debug function
  const logDebugInfo = () => {
    console.log('=== ENHANCED PAYMASTER DEBUG ===');
    console.log('Connection state:', {
      isConnected,
      isConnecting,
      address,
    });
    console.log('Connector info:', {
      name: connector?.name,
      type: connector?.type,
      id: connector?.id,
    });
    console.log('Wallet type check:', {
      isCoinbaseWallet: connector?.name?.includes('Coinbase'),
      isSmartWallet: isSmartWallet,
      isCheckingWallet,
    });
    console.log('Environment:', {
      paymasterUrl: process.env.NEXT_PUBLIC_PAYMASTER,
      cdpApiKey: process.env.NEXT_PUBLIC_CDP_API_CLIENT?.substring(0, 8) + '...',
      chainId,
      baseId: base.id,
    });
  };

  // Auto-log on mount and connection changes
  useEffect(() => {
    if (isClient) {
      logDebugInfo();
    }
  }, [isClient, isConnected, connector, isSmartWallet]);

  if (!isClient) {
    return <div>Loading...</div>;
  }

  if (!isConnected || !address) {
    return (
      <div className="p-6 max-w-md mx-auto bg-white rounded-lg shadow-lg">
        <h2 className="text-xl font-bold mb-4">Paymaster Test</h2>
        <p className="text-red-600">Please connect your wallet first.</p>
        <p className="text-sm text-gray-600 mt-2">
          Connection state: {isConnecting ? 'Connecting...' : 'Not connected'}
        </p>
      </div>
    );
  }

  if (isCheckingWallet) {
    return (
      <div className="p-6 max-w-md mx-auto bg-white rounded-lg shadow-lg">
        <h2 className="text-xl font-bold mb-4">Paymaster Test</h2>
        <p className="text-blue-600">Checking wallet type...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-lg shadow-lg">
      <h2 className="text-xl font-bold mb-4">Enhanced Paymaster Test</h2>
      
      {/* Wallet Type Check */}
      <div className="mb-4 p-3 bg-blue-50 rounded">
        <h3 className="font-medium mb-2">Wallet Information:</h3>
        <div className="text-sm space-y-1">
          <div>Connector: {connector?.name || 'Unknown'}</div>
          <div>Type: {connector?.type || 'Unknown'}</div>
          <div>Smart Wallet: {isSmartWallet ? '✅ Yes' : '❌ No'}</div>
          <div>Chain: {chainId === base.id ? '✅ Base' : `❌ Wrong (${chainId})`}</div>
          <div>Address: {address?.substring(0, 6)}...{address?.substring(address.length - 4)}</div>
        </div>
      </div>

      {/* Environment Check */}
      <div className="mb-4 p-3 bg-gray-100 rounded">
        <h3 className="font-medium mb-2">Environment Check:</h3>
        <div className="text-sm space-y-1">
          <div>CDP API Key: {process.env.NEXT_PUBLIC_CDP_API_CLIENT ? '✅ Set' : '❌ Missing'}</div>
          <div>Paymaster URL: {process.env.NEXT_PUBLIC_PAYMASTER ? '✅ Set' : '❌ Missing'}</div>
          <div>Wallet Connected: {isConnected ? '✅ Connected' : '❌ Not Connected'}</div>
        </div>
      </div>

      {!isSmartWallet && (
        <div className="mb-4 p-3 bg-yellow-100 rounded">
          <p className="text-yellow-800 text-sm">
            ⚠️ Smart Wallet not detected. Paymaster may not work properly.
          </p>
        </div>
      )}

      {/* Method 1: Using capabilities */}
      <div className="mb-4">
        <h3 className="font-medium mb-2">Test 1: Capabilities Method</h3>
        <Transaction
          chainId={base.id}
          calls={[testTransaction]}
          capabilities={{
            paymasterService: {
              url: process.env.NEXT_PUBLIC_PAYMASTER!,
            },
          }}
          onSuccess={(receipt) => {
            console.log('✅ CAPABILITIES TEST SUCCESS:', receipt);
            alert('Capabilities paymaster test successful!');
          }}
          onError={(error) => {
            console.error('❌ CAPABILITIES TEST FAILED:', error);
            console.error('Full error:', JSON.stringify(error, null, 2));
          }}
        >
          <TransactionButton
            text="Test Capabilities Method"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded mb-2"
          />
          <TransactionSponsor />
        </Transaction>
      </div>

      {/* Method 2: Using isSponsored */}
      <div className="mb-4">
        <h3 className="font-medium mb-2">Test 2: isSponsored Method</h3>
        <Transaction
          chainId={base.id}
          calls={[testTransaction]}
          isSponsored={true}
          onSuccess={(receipt) => {
            console.log('✅ SPONSORED TEST SUCCESS:', receipt);
            alert('Sponsored paymaster test successful!');
          }}
          onError={(error) => {
            console.error('❌ SPONSORED TEST FAILED:', error);
            console.error('Full error:', JSON.stringify(error, null, 2));
          }}
        >
          <TransactionButton
            text="Test isSponsored Method"
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded mb-2"
          />
          <TransactionSponsor />
        </Transaction>
      </div>

      {/* Method 3: Basic transaction (no paymaster) */}
      <div className="mb-4">
        <h3 className="font-medium mb-2">Test 3: Basic Transaction</h3>
        <Transaction
          chainId={base.id}
          calls={[testTransaction]}
          onSuccess={(receipt) => {
            console.log('✅ BASIC TEST SUCCESS:', receipt);
            alert('Basic transaction successful!');
          }}
          onError={(error) => {
            console.error('❌ BASIC TEST FAILED:', error);
          }}
        >
          <TransactionButton
            text="Test Basic Transaction"
            className="w-full bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded"
          />
        </Transaction>
      </div>

      {/* Debug Button */}
      <button
        onClick={logDebugInfo}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded"
      >
        Ultra Debug
      </button>
    </div>
  );
};

export default PaymasterTest;