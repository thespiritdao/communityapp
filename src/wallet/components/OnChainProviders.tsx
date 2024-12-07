import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from 'wagmi/chains';
import type { ReactNode } from 'react';

// Props for OnchainProviders Component
type Props = { children: ReactNode };

export function OnchainProviders({ children }: Props) {
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_CDP_API_KEY}
      chain={base}
      rpcUrl={process.env.NEXT_PUBLIC_RPC_URL}
    >
      {children}
    </OnchainKitProvider>
  );
}
