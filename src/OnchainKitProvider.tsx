import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useMemo } from 'react';
import { WagmiProvider } from 'wagmi';
import { ONCHAIN_KIT_CONFIG, setOnchainKitConfig } from './OnchainKitConfig';
import { DEFAULT_PRIVACY_URL, DEFAULT_TERMS_URL } from './constants';
import { createWagmiConfig } from './createWagmiConfig';
import { COINBASE_VERIFIED_ACCOUNT_SCHEMA_ID } from './identity/constants';
import { checkHashLength } from './internal/utils/checkHashLength';
import type { OnchainKitContextType, OnchainKitProviderReact } from './types';
import { useProviderDependencies } from './useProviderDependencies';

export const OnchainKitContext =
  createContext<OnchainKitContextType>(ONCHAIN_KIT_CONFIG);

/**
 * Provides the OnchainKit React Context to the app.
 */
export function OnchainKitProvider({
  address,
  apiKey,
  chain,
  children,
  config,
  projectId,
  rpcUrl,
  schemaId,
}: OnchainKitProviderReact) {
  if (schemaId && !checkHashLength(schemaId, 64)) {
    throw Error('EAS schemaId must be 64 characters prefixed with "0x"');
  }

  const value = useMemo(() => {
    const defaultPaymasterUrl = apiKey
      ? `https://api.developer.coinbase.com/rpc/v1/${chain.name
          .replace(' ', '-')
          .toLowerCase()}/${apiKey}`
      : null;
    const onchainKitConfig = {
      address: address ?? null,
      apiKey: apiKey ?? null,
      chain: chain,
      config: {
        appearance: {
          name: config?.appearance?.name ?? 'Dapp',
          logo: config?.appearance?.logo ?? '',
          mode: config?.appearance?.mode ?? 'auto',
          theme: config?.appearance?.theme ?? 'default',
        },
        paymaster: config?.paymaster || defaultPaymasterUrl,
        wallet: {
          display: config?.wallet?.display ?? 'classic',
          termsUrl: config?.wallet?.termsUrl || DEFAULT_TERMS_URL,
          privacyUrl: config?.wallet?.privacyUrl || DEFAULT_PRIVACY_URL,
        },
      },
      projectId: projectId ?? null,
      rpcUrl: rpcUrl ?? null,
      schemaId: schemaId ?? COINBASE_VERIFIED_ACCOUNT_SCHEMA_ID,
    };
    setOnchainKitConfig(onchainKitConfig);
    return onchainKitConfig;
  }, [address, apiKey, chain, config, projectId, rpcUrl, schemaId]);

  const { providedWagmiConfig, providedQueryClient } =
    useProviderDependencies();

  const defaultConfig = useMemo(() => {
    return (
      providedWagmiConfig ||
      createWagmiConfig({
        apiKey,
        appName: value.config.appearance.name,
        appLogoUrl: value.config.appearance.logo,
      })
    );
  }, [
    apiKey,
    providedWagmiConfig,
    value.config.appearance.name,
    value.config.appearance.logo,
  ]);

  const defaultQueryClient = useMemo(() => {
    return providedQueryClient || new QueryClient();
  }, [providedQueryClient]);

  if (!providedWagmiConfig && !providedQueryClient) {
    return (
      <WagmiProvider config={defaultConfig}>
        <QueryClientProvider client={defaultQueryClient}>
          <OnchainKitContext.Provider value={value}>
            {children}
          </OnchainKitContext.Provider>
        </QueryClientProvider>
      </WagmiProvider>
    );
  }

  return (
    <OnchainKitContext.Provider value={value}>
      {children}
    </OnchainKitContext.Provider>
  );
}
