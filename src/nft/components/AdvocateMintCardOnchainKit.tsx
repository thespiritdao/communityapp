// src/nft/components/AdvocateMintCardOnchainKit.tsx

import AdvocateMembershipABI from '../../../abis/AdvocateMembershipABI.json';
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';

interface AdvocateMintCardOnchainKitProps {
  address: `0x${string}`;
  contractAddress: `0x${string}`;
  memberType: number;
  tokenURI: string;
  onSuccess?: () => void;
  onError?: (error: any) => void;
}

export function AdvocateMintCardOnchainKit({
  address,
  contractAddress,
  memberType,
  tokenURI,
  onSuccess,
  onError,
}: AdvocateMintCardOnchainKitProps) {
  if (!address) return null;

  const contracts = [
    {
      address: contractAddress,
      abi: AdvocateMembershipABI,
      functionName: 'mint',
      args: [address, memberType, tokenURI],
    },
  ];

  return (
    <Transaction
      isSponsored={true}
      contracts={contracts}
      chainId={8453}
      onSuccess={onSuccess}
      onError={onError}
    >
      <TransactionButton text="Mint Membership NFT" />
      <TransactionSponsor />
      <TransactionStatus>
        <TransactionStatusLabel />
        <TransactionStatusAction />
      </TransactionStatus>
    </Transaction>
  );
}
