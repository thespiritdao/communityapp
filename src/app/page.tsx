// src/app/page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { Footer } from 'src/components/Footer';
import { Wallet } from 'src/wallet/components/Wallet';
import { useAccount } from 'wagmi';
import { supabase } from 'src/utils/supabaseClient'; // Updated Import Path
import 'src/styles/transactionStyles.css';
import { OnchainProviders } from 'src/wallet/components/OnchainProviders';
import { ConnectWallet } from 'src/wallet/components/ConnectWallet';
import { useRouter } from 'next/navigation';
import { createSupabaseSession } from 'src/utils/createSupabaseSession'; // Ensure Correct Relative Path

// -- Main Page component (wraps everything in OnchainProviders)
export default function Page() {
  return (
    <OnchainProviders>
      <PageContent />
    </OnchainProviders>
  );
}

// -- Actual page content, including sign-in logic
function PageContent() {
  // Wagmi hook: gets the currently connected wallet
  const { address, isConnecting, isDisconnected } = useAccount();

  // Track if we've completed signing in and if we've redirected
  const [hasSignedIn, setHasSignedIn] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);

  const router = useRouter();

  // Track if the component is mounted on the client side
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true); // Ensures the component is running on the client side
  }, []);

  // 1) As soon as we see "address" and we haven't signed in yet, run createSupabaseSession
useEffect(() => {
  const initiateSupabaseSession = async () => {
    if (address && !hasSignedIn && !isConnecting && !isDisconnected) {
      console.log('Wallet is connected. Attempting to create Supabase session...');
      try {
        // 1. First, get the tokens from our API
        const response = await fetch('/api/auth/onchainkit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ address }),
        });

        if (!response.ok) {
          throw new Error(`API call failed: ${response.statusText}`);
        }

        // 2. Get the tokens from the response
        const { supabaseToken, supabaseRefreshToken } = await response.json();

        // 3. Now create the Supabase session with both tokens
        await createSupabaseSession(supabaseToken, supabaseRefreshToken);
        setHasSignedIn(true);
      } catch (err) {
        console.error('Failed to create Supabase session:', err);
      }
    }
  };

  initiateSupabaseSession();
}, [address, hasSignedIn, isConnecting, isDisconnected]);

  // 2) After sign-in, redirect to /identity (and mark hasRedirected = true)
  useEffect(() => {
    if (address && hasSignedIn && !hasRedirected) {
      setHasRedirected(true);
      router.push('/identity');
    }
  }, [address, hasSignedIn, hasRedirected, router]);

  if (!isClient) return null;

  // 3) If no wallet is connected, show the connect button
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
            {/* "Enter" Button - For Wallet Creation or Login */}
            <ConnectWallet className="button button-enter" text="Enter" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // 4) If wallet is connected but hasn't signed in yet, show a "Creating your session..." message
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
            <p className="text-center text-white">
              Creating your session...
            </p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // 5) If wallet is connected and signed in but not yet redirected, show "Redirecting..."
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
            <p className="text-center text-white">
              Redirecting to your profile...
            </p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // 6) If all conditions are met, show the Wallet component
  return (
    <div>
      <img
        src="/images/doyoudare.png"
        alt="Background"
        className="background-image"
      />
      <div className="wrapper">
        <div className="button-container">
          <p className="text-center text-white">
            Welcome, your wallet is connected!
          </p>
          <Wallet />
        </div>
      </div>
      <Footer />
    </div>
  );
}
