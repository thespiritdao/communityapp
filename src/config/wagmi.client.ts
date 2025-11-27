// src/config/wagmi.client.ts
import { http, createConfig } from 'wagmi';
import { createPublicClient } from 'viem';
import { base, baseSepolia } from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors';

// Configure Coinbase Wallet with Smart Wallet support
const coinbaseWalletConnector = coinbaseWallet({
  appName: 'SpiritDAO',
  appLogoUrl: '/spiritdaosymbol.png',
  preference: 'smartWalletOnly', // forces Smart Wallet only
  version: '4',
});

// Log RPC configuration for debugging
console.log('🔗 Wagmi RPC Configuration:', {
  hasApiKey: Boolean(process.env.NEXT_PUBLIC_CDP_API_CLIENT),
  hasCustomRPC: Boolean(process.env.NEXT_PUBLIC_RPC_URL),
  usingCDP: Boolean(process.env.NEXT_PUBLIC_CDP_API_CLIENT),
  fallbackRPC: !process.env.NEXT_PUBLIC_CDP_API_CLIENT && !process.env.NEXT_PUBLIC_RPC_URL
});

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: [coinbaseWalletConnector],
  transports: {
    [base.id]: process.env.NEXT_PUBLIC_CDP_API_CLIENT
      ? http(`https://api.developer.coinbase.com/rpc/v1/base/${process.env.NEXT_PUBLIC_CDP_API_CLIENT}`)
      : process.env.NEXT_PUBLIC_RPC_URL 
        ? http(process.env.NEXT_PUBLIC_RPC_URL)
        : http(), // fallback to default if no API key or RPC URL
    [baseSepolia.id]: process.env.NEXT_PUBLIC_CDP_API_CLIENT
      ? http(`https://api.developer.coinbase.com/rpc/v1/base-sepolia/${process.env.NEXT_PUBLIC_CDP_API_CLIENT}`)
      : http(),
  },
  ssr: true, // Enable SSR support
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
});

// Create public client for contract reads
export const publicClient = createPublicClient({
  chain: base,
  transport: process.env.NEXT_PUBLIC_CDP_API_CLIENT
    ? http(`https://api.developer.coinbase.com/rpc/v1/base/${process.env.NEXT_PUBLIC_CDP_API_CLIENT}`)
    : process.env.NEXT_PUBLIC_RPC_URL 
      ? http(process.env.NEXT_PUBLIC_RPC_URL)
      : http(), // fallback to default if no API key or RPC URL
});