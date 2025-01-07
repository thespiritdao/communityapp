// Wallet.tsx

import { Children, useEffect, useMemo, useRef } from 'react';
import { findComponent } from '../../internal/utils/findComponent';
import { cn } from '../../styles/theme';
import { useIsMounted } from '../../useIsMounted';
import { useTheme } from '../../useTheme';
import type { WalletReact } from '../types';
import { ConnectWallet } from './ConnectWallet';
import { WalletDropdown } from './WalletDropdown';
import { WalletProvider, useWalletContext } from './WalletProvider';

const WalletContent = ({ children, className }: WalletReact) => {
  const { isOpen, setIsOpen } = useWalletContext();
  const walletContainerRef = useRef<HTMLDivElement>(null);

  const { connect, dropdown } = useMemo(() => {
    const childrenArray = Children.toArray(children);
    return {
      connect: childrenArray.find(findComponent(ConnectWallet)),
      dropdown: childrenArray.find(findComponent(WalletDropdown)),
    };
  }, [children]);

  useEffect(() => {
    const handleClickOutsideComponent = (event: MouseEvent) => {
      if (
        walletContainerRef.current &&
        !walletContainerRef.current.contains(event.target as Node) &&
        isOpen
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutsideComponent);
    return () =>
      document.removeEventListener('click', handleClickOutsideComponent);
  }, [isOpen, setIsOpen]);

  return (
    <div
      ref={walletContainerRef}
      className={cn('relative w-fit shrink-0', className)}
    >
      {connect}
      {isOpen && dropdown}
    </div>
  );
};

export const Wallet = ({ children, className }: WalletReact) => {
  const componentTheme = useTheme();
  const isMounted = useIsMounted();

  if (!isMounted) {
    return null;
  }

  return (
    <WalletProvider>
      <WalletContent className={cn(componentTheme, className)}>
        {children}
      </WalletContent>
    </WalletProvider>
  );
};

export const useWallet = () => {
  const context = useWalletContext();
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
};
