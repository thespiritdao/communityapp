// debugVote.mjs  (pure Viem, no wagmi)

import 'dotenv/config';
import { createPublicClient, http, parseAbi } from 'viem';
import DAOGovernorABI  from './src/abis/DAO_GovernorABI.json' assert { type: 'json' };
import TokenABI        from './src/abis/AdvocateTokenABI.json' assert { type: 'json' };

const BASE_RPC_URL     = 'https://mainnet.base.org';      // or your RPC
const BASE_CHAIN_ID    = 8453;
const TOKEN_ADDRESS    = '0xe4a2f419b4531417cb18d7ad95527eea620c4095';
const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR;
const proposalId       = 1;
const choice           = 1;   // 0/1/2

// Pass the wallet address you want to test as the first CLI arg:
const addr = process.argv[2];
if (!addr) {
  console.error("Usage: node debugVote.mjs <walletAddress>");
  process.exit(1);
}

const publicClient = createPublicClient({
  chain:  { id: BASE_CHAIN_ID, name: 'base', nativeCurrency: { name:'ETH', symbol:'ETH', decimals:18 } },
  transport: http(BASE_RPC_URL),
});

async function main () {
  console.log('Testing address:', addr);

  // 1. Current votes
  const votes = await publicClient.readContract({
    address: TOKEN_ADDRESS,
    abi: TokenABI,
    functionName: 'getVotes',
    args: [addr],
  });
  console.log('Current voting power:', votes.toString());

  // 2. Proposal state
  const state = await publicClient.readContract({
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'state',
    args: [proposalId],
  });
  console.log('Proposal state:', state);  // 0=Pending 1=Active …

  // 3. Local simulation of castVote
  try {
    await publicClient.simulateContract({
      account: addr,
      address: GOVERNOR_ADDRESS,
      abi: DAOGovernorABI,
      functionName: 'castVote',
      args: [BigInt(proposalId), choice],
    });
    console.log('✅ Simulation succeeded — contract won’t revert');
  } catch (err) {
    console.error('❌ Simulation reverted:', err.shortMessage || err.message);
  }
}

main();
