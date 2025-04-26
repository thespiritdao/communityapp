// src/app/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Footer } from 'src/components/Footer';
import { Wallet } from 'src/wallet/components/Wallet';
import { useAccount } from 'wagmi';
import { supabase } from 'src/utils/supabaseClient';
import 'src/styles/transactionStyles.css';
import { OnchainProviders } from 'src/wallet/components/OnchainProviders';
import { ConnectWallet } from 'src/wallet/components/ConnectWallet';
import { useRouter } from 'next/navigation';
import { createSupabaseSession } from 'src/utils/createSupabaseSession';

export default function Page() {
  return (
    <OnchainProviders>
      <PageContent />
    </OnchainProviders>
  );
}

function PageContent() {
  // useAccount returns the connected wallet address and connection state.
  const { address, isConnecting, isDisconnected } = useAccount();
  const router = useRouter();

  // Local state: track if a Supabase session has been created and if a redirect has occurred.
  const [hasSignedIn, setHasSignedIn] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);
  // Also track client-side mounting to avoid SSR hydration issues.
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // As soon as a wallet is connected and we're not already signed in, create a Supabase session.
  useEffect(() => {
    const initiateSupabaseSession = async () => {
      if (address && !hasSignedIn && !isConnecting && !isDisconnected) {
        console.log('Wallet is connected. Attempting to create Supabase session...');
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
  }, [address, hasSignedIn, isConnecting, isDisconnected]);

  // Once the wallet is connected and session has been created, redirect the user.
  useEffect(() => {
    if (address && hasSignedIn && !hasRedirected) {
      console.log(`User logged in: ${address}. Redirecting...`);
      setHasRedirected(true);
      router.push('/home');
    }
  }, [address, hasSignedIn, hasRedirected, router]);

  if (!isClient) return null;

  // If no wallet is connected, show the ConnectWallet component.
  // This component (from your old, working code) should trigger the Coinbase wallet login via OnchainKit.
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
            {/* Old ConnectWallet button that previously triggered the Coinbase login flow */}
            <ConnectWallet className="button enter-button" text="Enter" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // If the wallet is connected but the Supabase session is still being created...
  if (address && !hasSignedIn) {
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

  // If the wallet is connected and signed in but not yet redirected, show a redirect message.
  if (address && hasSignedIn && !hasRedirected) {
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
          <p className="text-center text-white">Welcome, your wallet is connected!</p>
          <Wallet />
        </div>
      </div>
      <Footer />
    </div>
  );
}
