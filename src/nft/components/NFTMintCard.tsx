// src/nft/components/NFTMintCard.tsx
'use client';
import React, { ReactNode, ReactElement } from 'react';
import { background, border, cn, color } from 'src/styles/theme';
import { useIsMounted } from 'src/useIsMounted';
import { useTheme } from 'src/useTheme';
import { LifecycleType, NFTMintCardReact } from 'src/nft/types';
import NFTErrorBoundary from 'src/nft/components/NFTErrorBoundary';
import { NFTErrorFallback } from 'src/nft/components/NFTErrorFallback';
import { NFTLifecycleProvider } from 'src/nft/components/NFTLifecycleProvider';
import { NFTProvider, useNFTContext } from 'src/nft/components/NFTProvider';
import AdvocateMembershipABI from 'src/abis/AdvocateMembershipABI.json';

export interface AdvocateMintCardProps
  extends Omit<NFTMintCardReact, 'buildMintTransaction'> {
  memberType: number;
  tokenURI: string;
  /**
   * children can be either plain JSX or a render-prop function
   * which receives `{ mint, isLoading }` from the NFTProvider context.
   */
  children:
    | ReactNode
    | ((opts: { mint: () => Promise<void>; isLoading: boolean }) => ReactElement);
}

export function AdvocateMintCard({
  contractAddress,
  tokenId,
  isSponsored,
  useNFTData,
  onStatus,
  onError,
  onSuccess,
  memberType,
  tokenURI,
  children,
  className,
}: AdvocateMintCardProps) {
  // 1) hooks in a stable order
  const theme = useTheme();
  const isMounted = useIsMounted();
  const { mint, isLoading } = useNFTContext(); // always after the provider

  // 2) bail after hooks
  if (!isMounted) return null;

  // 3) our custom mint‐tx builder for Advocate
  const buildMintTransaction = () => ({
    address: contractAddress,
    abi: AdvocateMembershipABI,
    functionName: 'mint',
    args: [undefined as any, memberType, tokenURI] as any[],
  });

  return (
    <NFTErrorBoundary fallback={<NFTErrorFallback />}>
      <NFTLifecycleProvider
        type={LifecycleType.MINT}
        onStatus={onStatus}
        onError={onError}
        onSuccess={onSuccess}
      >
        <NFTProvider
          contractAddress={contractAddress}
          tokenId={tokenId}
          isSponsored={isSponsored}
          useNFTData={useNFTData}
          buildMintTransaction={buildMintTransaction}
        >
          <div
            className={cn(
              theme,
              color.foreground,
              background.default,
              border.defaultActive,
              border.radius,
              'flex w-full max-w-[500px] flex-col gap-2 border p-4',
              className
            )}
            data-testid="ockNFTMintCard_Container"
          >
            {typeof children === 'function'
              ? children({ mint, isLoading })
              : children}
          </div>
        </NFTProvider>
      </NFTLifecycleProvider>
    </NFTErrorBoundary>
  );
}

