// src/nft/components/AdvocateMintCardOnchainKit.tsx

import AdvocateMembershipABI from 'src/abis/AdvocateMembershipABI.json';
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';

export function AdvocateMintCardOnchainKit({
  address,
  contractAddress,
  memberType,
  tokenURI,
  onSuccess,
  onError,
}) {
  if (!address) return null;

  const contracts = [{
    address: contractAddress,
    abi: AdvocateMembershipABI,
    functionName: 'mint',
    args: [address, memberType, tokenURI],
  }];

  return (
    <Transaction
      isSponsored
      address={address}
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
