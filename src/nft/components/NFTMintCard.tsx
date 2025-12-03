// src/nft/components/NFTMintCard.tsx
'use client';
import type { ReactNode } from 'react';
import { background, border, cn, color } from '@/styles/theme';
import { useIsMounted } from '@/useIsMounted';
import { useTheme } from '@/useTheme';
import { LifecycleType, type NFTMintCardReact } from '@/nft/types';
import NFTErrorBoundary from '@/nft/components/NFTErrorBoundary';
import { NFTErrorFallback } from '@/nft/components/NFTErrorFallback';
import { NFTLifecycleProvider } from '@/nft/components/NFTLifecycleProvider';
import { NFTProvider } from '@/nft/components/NFTProvider';
import AdvocateMembershipABI from '@/abis/AdvocateMembershipABI.json';

interface AdvocateMintCardProps
  extends Omit<NFTMintCardReact, 'buildMintTransaction' | 'children' | 'useNFTData'> {
  memberType: number;
  tokenURI: string;
  children: ReactNode;
  useNFTData: NonNullable<NFTMintCardReact['useNFTData']>;
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

  // 2) bail after hooks
  if (!isMounted) return null;

  // 3) our custom mint‐tx builder for Advocate
  const buildMintTransaction = async (props: any) => {
    return [{
      to: contractAddress,
      data: '0x' as `0x${string}`,
      value: 0n,
    }];
  };

  return (
    <NFTErrorBoundary fallback={NFTErrorFallback}>
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
              className,
            )}
            data-testid="ockNFTMintCard_Container"
          >
            {children}
          </div>
        </NFTProvider>
      </NFTLifecycleProvider>
    </NFTErrorBoundary>
  );
}
