import { getWalletClient, getAccount, readContract, simulateContract } from 'wagmi/actions';
import { publicClient } from 'wagmi';                 // whichever client you already use
import DAOGovernorABI from 'src/abis/DAO_GovernorABI.json';
import TokenABI from 'src/abis/AdvocateTokenABI.json';   // <-- replace with your NFT ABI

const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;
const TOKEN_ADDRESS     = "0xe4a2f419b4531417cb18d7ad95527eea620c4095"; // your Advocate NFT
const BASE_CHAIN_ID     = 8453;
const proposalId        = 1;          // the proposal you’re testing
const choice            = 1;          // 0=Against,1=For,2=Abstain

async function debugVote() {
  // 1. get the CB Smart-Wallet address
  const walletClient  = await getWalletClient({ chainId: BASE_CHAIN_ID });
  const smartAddr     = walletClient.account.address;
  console.log("Smart-wallet address:", smartAddr);

  // 2. check current voting power
  const votes = await publicClient.readContract({
    address: TOKEN_ADDRESS,
    abi:     TokenABI,
    functionName: 'getVotes',     // current votes
    args: [smartAddr],
  });
  console.log("Current voting power:", votes.toString());

  // 3. check proposal state (optional, if you’re voting)
  const state = await publicClient.readContract({
    address: GOVERNOR_ADDRESS,
    abi:     DAOGovernorABI,
    functionName: 'state',
    args: [proposalId],
  });
  console.log("Proposal state:", state);  // 0=Pending 1=Active …

  // 4. run a local simulation with the same call bundler uses
  try {
    await publicClient.simulateContract({
      chainId: BASE_CHAIN_ID,
      account: smartAddr,
      address: GOVERNOR_ADDRESS,
      abi:     DAOGovernorABI,
      functionName: 'castVote',
      args: [BigInt(proposalId), choice],
    });
    console.log("✅ Simulation succeeded — should pass bundler too");
  } catch (err: any) {
    console.error("❌ Simulation reverted:", err.shortMessage || err.message);
  }
}

debugVote();
