// src/wallet/components/WalletWrapper.tsx

import React, { ReactNode } from 'react';
import ConnectWallet from 'src/wallet/components/ConnectWallet';
import WalletProvider from 'src/wallet/components//WalletProvider';
import WalletDropdown from 'src/wallet/components//WalletDropdown';
import WalletDropdownDisconnect from 'src/wallet/components//WalletDropdownDisconnect';
import WalletDropdownLink from 'src/wallet/components//WalletDropdownLink';

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
