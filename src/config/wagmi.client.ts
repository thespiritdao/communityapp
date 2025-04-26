// src/config/wagmi.ts
import { createConfig, http } from 'wagmi';
import { base } from 'viem/chains';
import { coinbaseWallet } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    // Use your RPC URL from the environment variable
    [base.id]: http(process.env.NEXT_PUBLIC_RPC_URL as string),
  },
  autoConnect: true,
  connectors: [
    coinbaseWallet({
      chainId: base.id,
      options: {
        appName: process.env.NEXT_PUBLIC_APP_NAME || 'SpiritDAO',
        // (Optionally, set preference if you need smart wallet behavior)
        // preference: 'smartWalletOnly',
      },
    }),
  ],
});
