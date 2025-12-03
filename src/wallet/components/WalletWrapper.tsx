// src/wallet/components/WalletWrapper.tsx

import type { ReactNode } from 'react';
import ConnectWallet from './ConnectWallet';
import WalletProvider from './WalletProvider';
import WalletDropdown from './WalletDropdown';
import WalletDropdownDisconnect from './WalletDropdownDisconnect';
import WalletDropdownLink from './WalletDropdownLink';

type Props = {
  children?: ReactNode;
};

const WalletWrapper = ({ children }: Props) => {
  return (
    <WalletProvider>
      <ConnectWallet />
      <WalletDropdown>
        <WalletDropdownLink href="https://wallet.coinbase.com">
          Wallet Dashboard
        </WalletDropdownLink>
        <WalletDropdownDisconnect />
      </WalletDropdown>
      {children}
    </WalletProvider>
  );
};

export default WalletWrapper;
