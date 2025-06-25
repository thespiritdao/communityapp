// src/config/wagmi.client.ts
import { http, createConfig } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors';

// Configure Coinbase Wallet with Smart Wallet support
const coinbaseWalletConnector = coinbaseWallet({
  appName: 'SpiritDAO',
  appLogoUrl: '/spiritdaosymbol.png',
  preference: 'smartWalletOnly', // forces Smart Wallet only
  version: '4',
});

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: [coinbaseWalletConnector],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
});