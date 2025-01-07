// src/app/page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { Footer } from 'src/components/Footer';
import { Wallet } from 'src/wallet/components/Wallet';
import { useAccount } from 'wagmi';
import 'src/styles/transactionStyles.css';
import { OnchainProviders } from 'src/wallet/components/OnchainProviders'; // Named import for consistency
import { ConnectWallet } from 'src/wallet/components/ConnectWallet';
import { useRouter } from 'next/navigation';

// The main Page component
export default function Page() {
  return (
    <OnchainProviders>
      <PageContent />
    </OnchainProviders>
  );
}

// The content of the page
function PageContent() {
  const { address } = useAccount();
  const [hasRedirected, setHasRedirected] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsClient(true); // Ensures the component is running on the client side
  }, []);

  useEffect(() => {
    if (address && !hasRedirected) {
      router.push('/identity'); // Redirect to the identity page
      setHasRedirected(true);
    }
  }, [address, hasRedirected, router]);

  // Prevent rendering during server-side rendering
  if (!isClient) {
    return null;
  }

  // Show a loading message if the user is being redirected
  if (address && !hasRedirected) {
    return (
      <p className="text-center text-white">
        Redirecting to your profile...
      </p>
    );
  }

  return (
    <div>
      <img
        src="/images/doyoudare.png"
        alt="Background"
        className="background-image"
      />
      <div className="wrapper">
        <div className="button-container">
          {!address ? (
            <>
              {/* "Enter" Button - For Wallet Creation or Login */}
              <ConnectWallet className="button button-enter" text="Enter" />
            </>
          ) : (
            <div>
              <p className="text-center text-white">
                Welcome, your wallet is connected!
              </p>
              <Wallet />
            </div>
          )}
        </div>
        <Footer />
      </div>
    </div>
  );
}
