import { useAccount } from 'wagmi';
import AdvocateMembershipABI from 'src/abis/AdvocateMembershipABI.json';
import { NFTMintCardGeneral } from 'src/nft/components/NFTMintCardGeneral';
import { useToast } from 'src/components/ui/use-toast';

const ADVOCATE_CONTRACT = '0xd05b10248f1F72e8B9fEbd9E9c87887Ab0a1aAB0';
const DEFAULT_MEMBER_TYPE = 0; // e.g., STANDARD
const DEFAULT_TOKEN_URI = 'https://gateway.pinata.cloud/ipfs/<YOUR_HASH>';

export default function MintPage() {
  const { address } = useAccount();
  const { toast } = useToast();

  return (
    <NFTMintCardGeneral
      contractAddress={ADVOCATE_CONTRACT}
      abi={AdvocateMembershipABI}
      mintArgs={[address, DEFAULT_MEMBER_TYPE, DEFAULT_TOKEN_URI]}
      chainId={8453}
      isSponsored
      mediaUrl="https://your-nft-media-url" // Replace with real URL or from metadata
      collectionName="Advocate Membership"
      title="Mint Your Advocate NFT"
      description="This NFT grants you membership in the Advocate community. Holders can participate in governance and unlock exclusive features."
      costLabel="FREE (Sponsored)"
      onSuccess={txHash => toast({
        title: 'Mint successful!',
        description: (
          <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline">View on BaseScan</a>
        )
      })}
      onError={err => toast({
        title: 'Mint failed',
        description: err?.shortMessage || err?.message || 'Unknown error',
        variant: 'destructive',
      })}
    />
  );
}
