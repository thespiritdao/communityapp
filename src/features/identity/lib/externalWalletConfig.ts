// src/features/identity/lib/externalWalletConfig.ts
//
// ISOLATED wagmi config used ONLY by the "Link external wallet" flow.
//
// This is intentionally SEPARATE from the global CDP config in
// src/config/wagmi.client.ts. The global config uses
// coinbaseWallet({ preference: 'smartWalletOnly' }), which is load-bearing
// for CDP embedded wallets, so we must NOT add injected/walletConnect
// connectors there.
//
// This config connects an external browser wallet (MetaMask via the injected
// connector) purely to request a MESSAGE SIGNATURE proving ownership. It is
// never used for transactions. All @wagmi/core actions (connect, signMessage,
// disconnect, getAccount) are called with THIS config passed explicitly, so
// they never touch the global provider's connection state.

import { http, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const externalWalletConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  connectors: [injected()],
  // Isolated from the global provider; no SSR hydration concerns here since
  // it's only ever used inside client-side event handlers.
  ssr: false,
});
