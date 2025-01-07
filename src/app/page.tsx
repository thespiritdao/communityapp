// src/app/page.tsx

'use client';
import React, { useState, useEffect } from 'react';
import { Footer } from 'src/components/Footer';
import { Wallet } from 'src/wallet/components/Wallet';
import { useAccount } from 'wagmi';
import 'src/styles/transactionStyles.css';
import { OnchainProviders } from 'src/wallet/components/OnchainProviders'; // Change to named import
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
<<<<<<< HEAD
		setIsClient(true);
	}, []);

	useEffect(() => {
=======
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151
	  if (address && !hasRedirected) {
		router.push('/identity');
		setHasRedirected(true);
	  }
	}, [isClient, address, hasRedirected, router]);

	if (!isClient) {
	return null; // Prevent server-side rendering issues
	}
<<<<<<< HEAD
	
	  // If user already connected and redirecting, 
	  // optionally show a loading state or a message
	if (address && !hasRedirected) {
		return <p className="text-center text-white">Redirecting to your profile...</p>;
	}
=======
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151

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
              <Wallet /> {/* This component might display wallet information or give options for managing the wallet */}
            </div>
          )}
        </div>
        <Footer />
      </div>
    </div>
  );
}
