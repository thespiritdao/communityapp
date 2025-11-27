// src/wallet/components/WalletWrapper.tsx

import type { ReactNode } from 'react';
import ConnectWallet from '../../../wallet/components/ConnectWallet';
import WalletProvider from '../../../wallet/components//WalletProvider';
import WalletDropdown from '../../../wallet/components//WalletDropdown';
import WalletDropdownDisconnect from '../../../wallet/components//WalletDropdownDisconnect';
import WalletDropdownLink from '../../../wallet/components//WalletDropdownLink';

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
