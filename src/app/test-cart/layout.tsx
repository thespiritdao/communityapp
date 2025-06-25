'use client';

import { WagmiConfig, createConfig, http } from 'wagmi';
import { baseGoerli } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

const config = createConfig({
  chains: [baseGoerli],
  transports: {
    [baseGoerli.id]: http()
  },
  connectors: [
    injected()
  ]
});

export default function TestCartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WagmiConfig config={config}>
      {children}
    </WagmiConfig>
  );
} 