// src/app/PageContent.tsx

'use client';
import React, { useEffect, useState } from 'react';
import Footer from 'src/components/Footer';
import Wallet from 'src/wallet/components/Wallet';
import { ONCHAINKIT_LINK } from 'src/wallet/constants';
import walletSvg from 'src/internal/svg/walletSvg';
import Transaction from 'src/transaction/components/Transaction';
import AuthPage from 'src/components/AuthPage';
import { useAccount } from 'wagmi';
import 'src/styles/transactionStyles.css';
import Image from 'next/image';

export default function PageContent() {
  const { address } = useAccount();
  const [isClient, setIsClient] = useState(false);

  // Ensure that the content is only rendered after the component has mounted
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Mock calls or contracts for testing purposes
  const mockCalls = [
    {
      to: '0x1234567890abcdef1234567890abcdef12345678', // Test contract address on Base Sepolia
      data: '0xa9059cbb000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd00000000000000000000000000000000000000000000000000000000000003e8', // ABI-encoded call data for ERC-20 transfer
    },
  ];

  if (!isClient) {
    return null; // Avoid rendering during SSR to prevent hydration mismatch
  }

  return (
    <div>
      <img
        src="/images/doyoudare.png"
        alt="Background"
        className="background-image"
      />
      <div className="wrapper">
        {address ? (
          <Transaction
            calls={mockCalls}
            chainId={11155111} // Assuming this is the Sepolia testnet chainId
            onError={(error) => console.error('Transaction Error:', error)}
            onStatus={(status) => console.log('Transaction Status:', status)}
            onSuccess={(data) => console.log('Transaction Success:', data)}
          >
            <div>
              <p className="text-center text-white">Transaction Section</p>
            </div>
          </Transaction>
        ) : (
          <div className="button-container">
            <button className="button">Join</button>
            <button className="button">Login</button>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
