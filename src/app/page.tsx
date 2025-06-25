// src/app/page.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Footer } from 'src/components/Footer';
import { Wallet } from 'src/wallet/components/Wallet';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { supabase } from 'src/utils/supabaseClient';
import 'src/styles/transactionStyles.css';
import { useRouter } from 'next/navigation';
import { createSupabaseSession } from 'src/utils/createSupabaseSession';
import { coinbaseWallet } from 'wagmi/connectors';

export default function Page() {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    setIsInitialized(true);
  }, []);

  if (!isInitialized) {
    return <div>Loading...</div>;
  }

  return <PageContent />;
}

function PageContent() {
  // useAccount returns the connected wallet address and connection state.
  const { address, isConnecting, isDisconnected, connector } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const router = useRouter();

  // Local state: track if a Supabase session has been created and if a redirect has occurred.
  const [hasSignedIn, setHasSignedIn] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);
  const [isSmartWallet, setIsSmartWallet] = useState(false);
  const [isVerifyingWallet, setIsVerifyingWallet] = useState(false);
  const [isVerificationComplete, setIsVerificationComplete] = useState(false);
  const verificationRef = useRef({ isComplete: false, isSmartWallet: false });
  // Also track client-side mounting to avoid SSR hydration issues.
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Check if the connected wallet is a Smart Wallet
  useEffect(() => {
    let cancelled = false; // to prevent setting state after unmount
  
    const checkSmartWallet = async () => {
      setIsVerifyingWallet(true);
      setIsVerificationComplete(false);
      verificationRef.current = { isComplete: false, isSmartWallet: false };
  
      if (!address || !connector) {
        if (!cancelled) {
          setIsSmartWallet(false);
          setIsVerifyingWallet(false);
          setIsVerificationComplete(true);
          verificationRef.current = { isComplete: true, isSmartWallet: false };
        }
        return;
      }
  
      let detected = false;
      let detectedMethod = "";
  
      try {
        console.log('Starting wallet verification for:', {
          connectorName: connector.name,
          connectorId: connector.id,
          connectorType: connector.type,
          address
        });
  
        const isCoinbaseConnector =
          connector.name === 'Coinbase Wallet' ||
          connector.id === 'coinbaseWallet' ||
          connector.id === 'coinbaseWalletSDK';
  
        if (!isCoinbaseConnector) {
          detected = false;
          detectedMethod = "Not a Coinbase connector";
        } else {
          // Get provider
          let provider = null;
          if (typeof connector.getProvider === 'function') {
            try {
              provider = await connector.getProvider();
              console.log('Provider obtained:', provider);
            } catch (error) {
              console.log('getProvider method failed:', error);
            }
          }
          if (!provider && connector.provider) {
            provider = connector.provider;
            console.log('Using connector provider:', provider);
          }
  
          // First check: Contract code (highest authority)
          if (provider) {
            try {
              const code = await provider.request({
                method: 'eth_getCode',
                params: [address, 'latest']
              });
              const hasContractCode = code && code !== '0x' && code !== '0x0';
              console.log('Contract code check:', { address, code, hasContractCode });
              if (hasContractCode) {
                detected = true;
                detectedMethod = "Contract code on address";
                console.log('Smart Wallet detected via contract code');
              }
            } catch (err) {
              console.log('Contract code check failed:', err);
            }
          }
  
          // Second check: Provider properties
          if (provider && !detected) {
            console.log('Checking provider properties:', {
              isCoinbaseWallet: provider.isCoinbaseWallet,
              isSmartWallet: provider.isSmartWallet,
              selectedProvider: provider.selectedProvider
            });
  
            if (
              provider.isCoinbaseWallet &&
              (provider.isSmartWallet === true ||
                provider.selectedProvider === 'smartWallet')
            ) {
              detected = true;
              detectedMethod = "Provider indicates Smart Wallet";
              console.log('Smart Wallet detected via provider properties');
            } else if (
              provider.isCoinbaseWallet &&
              (provider.isSmartWallet === false ||
                provider.selectedProvider === 'extension' ||
                provider.selectedProvider === 'mobile' ||
                provider.qrUrl !== undefined)
            ) {
              detected = false;
              detectedMethod = "Provider indicates NOT Smart Wallet";
              console.log('Not a Smart Wallet based on provider properties');
            }
          }
  
          // Last check: Connector options
          if (!detected && connector.options) {
            console.log('Checking connector options:', connector.options);
            if (
              connector.options.preference === 'smartWalletOnly' ||
              connector.options.enableSmartWallet === true
            ) {
              detected = true;
              detectedMethod = "Connector options indicate Smart Wallet";
              console.log('Smart Wallet detected via connector options');
            }
          }
        }
      } catch (error) {
        detected = false;
        detectedMethod = "Exception thrown";
        console.error('Error checking wallet type:', error);
      } finally {
        if (!cancelled) {
          console.log('Final wallet verification result:', {
            detected,
            detectedMethod,
            address
          });
          
          // Update both state and ref atomically
          verificationRef.current = { isComplete: true, isSmartWallet: detected };
          setIsSmartWallet(detected);
          setIsVerifyingWallet(false);
          setIsVerificationComplete(true);
        }
      }
    };
  
    checkSmartWallet();
  
    return () => {
      cancelled = true; // Prevent state updates if unmounting
    };
  }, [address, connector]);
  

  // Disconnect effect
  useEffect(() => {
    if (address && verificationRef.current.isComplete) {
      console.log('Verification complete, checking wallet status:', {
        isSmartWallet: verificationRef.current.isSmartWallet,
        address,
        isVerificationComplete: verificationRef.current.isComplete
      });
      
      if (!verificationRef.current.isSmartWallet) {
        console.log('Non-Smart Wallet detected after complete verification. Disconnecting...');
        disconnect();
      } else {
        console.log('Smart Wallet verified, proceeding with connection');
      }
    }
  }, [address, isVerificationComplete, disconnect]);
  

  // As soon as a Smart Wallet is connected and we're not already signed in, create a Supabase session.
  useEffect(() => {
    const initiateSupabaseSession = async () => {
      if (address && isSmartWallet && !hasSignedIn && !isConnecting && !isDisconnected) {
        console.log('Smart Wallet is connected. Attempting to create Supabase session...');
        try {
          // Call your API to get the tokens.
          const response = await fetch('/api/auth/onchainkit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address }),
          });
          if (!response.ok) {
            throw new Error(`API call failed: ${response.statusText}`);
          }
          // Retrieve tokens.
          const { supabaseToken, supabaseRefreshToken } = await response.json();
          // Create the Supabase session.
          await createSupabaseSession(supabaseToken, supabaseRefreshToken);
          setHasSignedIn(true);
        } catch (err) {
          console.error('Failed to create Supabase session:', err);
        }
      }
    };

    initiateSupabaseSession();
  }, [address, isSmartWallet, hasSignedIn, isConnecting, isDisconnected]);

  // Once the Smart Wallet is connected and session has been created, redirect the user.
  useEffect(() => {
    if (address && isSmartWallet && hasSignedIn && !hasRedirected) {
      console.log(`User logged in with Smart Wallet: ${address}. Redirecting...`);
      setHasRedirected(true);
      router.push('/home');
    }
  }, [address, isSmartWallet, hasSignedIn, hasRedirected, router]);

  // Function to connect Smart Wallet only
  const connectSmartWallet = () => {
    // Find the Coinbase Wallet connector
    const coinbaseConnector = connectors.find(
      (connector) => connector.name === 'Coinbase Wallet' || 
                    connector.id === 'coinbaseWallet' ||
                    connector.id === 'coinbaseWalletSDK'
    );
    
    if (coinbaseConnector) {
      console.log('Connecting with Coinbase Smart Wallet:', coinbaseConnector);
      connect({ connector: coinbaseConnector });
    } else {
      console.error('Coinbase Wallet connector not found. Available connectors:', 
        connectors.map(c => ({ name: c.name, id: c.id })));
    }
  };

  if (!isClient) return null;

  // If no wallet is connected, show the Smart Wallet connect button.
  if (!address) {
    return (
      <div>
        <img
          src="/images/doyoudare.png"
          alt="Background"
          className="background-image"
        />
        <div className="wrapper">
          <div className="button-container">
            <div className="text-center mb-4">
              <h2 className="text-white text-xl mb-2">Create Your Smart Wallet</h2>
              <p className="text-white text-sm mb-4">
                Smart Wallets provide enhanced security and no seed phrases required.
                You'll use your device's biometrics or passkey to access your wallet.
              </p>
            </div>
            <button
              onClick={connectSmartWallet}
              className="button enter-button"
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting...' : 'Create Smart Wallet'}
            </button>
            <div className="text-center mt-4">
              <p className="text-white text-xs">
                Only Smart Wallets are supported. Traditional wallets will be disconnected.
              </p>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // If a wallet is connected but we're still verifying if it's a Smart Wallet
  if (address && isVerifyingWallet) {
    return (
      <div>
        <img
          src="/images/doyoudare.png"
          alt="Background"
          className="background-image"
        />
        <div className="wrapper">
          <div className="button-container">
            <p className="text-center text-white">Verifying Smart Wallet...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // If a wallet is connected but it's not a Smart Wallet
  if (address && !isSmartWallet && !isVerifyingWallet) {
    return (
      <div>
        <img
          src="/images/doyoudare.png"
          alt="Background"
          className="background-image"
        />
        <div className="wrapper">
          <div className="button-container">
            <div className="text-center mb-4">
              <h2 className="text-white text-xl mb-2">Smart Wallet Required</h2>
              <p className="text-white text-sm mb-4">
                This application requires a Smart Wallet. Your current wallet type is not supported.
                Please create a Smart Wallet to continue.
              </p>
            </div>
            <button
              onClick={connectSmartWallet}
              className="button enter-button"
            >
              Create Smart Wallet
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // If the Smart Wallet is connected but the Supabase session is still being created...
  if (address && isSmartWallet && !hasSignedIn) {
    return (
      <div>
        <img
          src="/images/doyoudare.png"
          alt="Background"
          className="background-image"
        />
        <div className="wrapper">
          <div className="button-container">
            <p className="text-center text-white">Creating your session...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // If the Smart Wallet is connected and signed in but not yet redirected, show a redirect message.
  if (address && isSmartWallet && hasSignedIn && !hasRedirected) {
    return (
      <div>
        <img
          src="/images/doyoudare.png"
          alt="Background"
          className="background-image"
        />
        <div className="wrapper">
          <div className="button-container">
            <p className="text-center text-white">Redirecting to your profile...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Finally, if everything is ready, show the Wallet component (for dashboard use).
  return (
    <div>
      <img
        src="/images/doyoudare.png"
        alt="Background"
        className="background-image"
      />
      <div className="wrapper">
        <div className="button-container">
          <p className="text-center text-white">Welcome, your Smart Wallet is connected!</p>
          <Wallet />
        </div>
      </div>
      <Footer />
    </div>
  );
}