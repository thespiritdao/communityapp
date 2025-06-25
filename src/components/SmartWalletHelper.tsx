// src/components/SmartWalletHelper.tsx
'use client';
import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useToast } from 'src/components/ui/use-toast';

export const SmartWalletHelper: React.FC = () => {
  const { address, connector } = useAccount();
  const { toast } = useToast();
  const [isSmartWallet, setIsSmartWallet] = useState(false);

  useEffect(() => {
    const checkWalletType = async () => {
      if (!address || !connector) return;

      // Check if using Coinbase Smart Wallet
      const isCSW = connector.name === 'Coinbase Wallet' || 
                    connector.id === 'coinbaseWalletSDK' ||
                    connector.name.includes('Smart Wallet');

      setIsSmartWallet(isCSW);

      if (isCSW) {
        console.log('=== Smart Wallet Detected ===');
        console.log('Connector:', connector.name);
        console.log('Address:', address);
        
        // Show helpful info for first-time users
        const hasShownTip = localStorage.getItem('smart-wallet-tip-shown');
        if (!hasShownTip) {
          toast({
            title: 'Smart Wallet Detected',
            description: 'Remember to delegate your voting power to participate in governance!',
            duration: 10000,
          });
          localStorage.setItem('smart-wallet-tip-shown', 'true');
        }
      }
    };

    checkWalletType();
  }, [address, connector, toast]);

  return null;
};