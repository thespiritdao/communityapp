// src/utils/fetchTokenBalances.ts
import Web3 from 'web3';

// Minimal JSON ABIs for ERC20 and ERC721
const erc20Abi = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
];

const erc721Abi = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
];

const erc1155Abi = [
  {
    inputs: [
      { internalType: 'address', name: 'account', type: 'address' },
      { internalType: 'uint256', name: 'id', type: 'uint256' },
    ],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// Minimal Multicall ABI (only the aggregate function)
const multicallAbi = [
  {
    constant: true,
    inputs: [
      {
        components: [
          { name: 'target', type: 'address' },
          { name: 'callData', type: 'bytes' },
        ],
        name: 'calls',
        type: 'tuple[]',
      },
    ],
    name: 'aggregate',
    outputs: [
      { name: 'blockNumber', type: 'uint256' },
      { name: 'returnData', type: 'bytes[]' },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
];

// Environment variables – adjust these to your production values.
const PROOF_OF_CURIOSITY_CONTRACT = process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY;
const SYSTEM_TOKEN_CONTRACT = process.env.NEXT_PUBLIC_SYSTEM_TOKEN;
const SELF_TOKEN_CONTRACT = process.env.NEXT_PUBLIC_SELF_TOKEN;
// MARKET_ADMIN_TOKEN_CONTRACT removed - replaced by MARKET_MANAGEMENT_HAT_ID (Hat token)
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
const NETWORK_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '8453');
// Set the multicall contract address – deploy your own or use a known one.
const MULTICALL_ADDRESS =
  process.env.NEXT_PUBLIC_MULTICALL_ADDRESS || '0xYourMulticallContractAddress';

//hats

const HATS_CONTRACT = process.env.NEXT_PUBLIC_HATS_CONTRACT;
import { getClientHatId } from '@/lib/hatRegistryClient';
const EXECUTIVE_POD_HAT_ID = getClientHatId('EXECUTIVE_POD_LEADER'); // raw hat id (hex string)

// Add bounty hat ID
const BOUNTY_HAT_ID = process.env.NEXT_PUBLIC_BOUNTY_MANAGEMENT;

// Add market management hat ID
const MARKET_MANAGEMENT_HAT_ID = process.env.NEXT_PUBLIC_MARKET_MANAGEMENT;

// Add event management hat ID
const EVENT_MANAGEMENT_HAT_ID = process.env.NEXT_PUBLIC_EVENT_MANAGEMENT;

// Add Advocate NFT contract
const ADVOCATE_TOKEN_CONTRACT = '0x592E560171D2a882474cdfc3BbeeDb21cEB4015d';

// Create a Web3 provider and instance.
const provider = new Web3.providers.HttpProvider(RPC_URL!);
const web3 = new Web3(provider);

// Add type for contract result
type ContractResult = [bigint, string[]];

// Add type for token balance
export interface TokenBalance {
  hasProofOfCuriosity: boolean;
  hasMarketAdmin: boolean; // Kept for backward compatibility - maps to hasMarketManagement
  hasMarketManagement: boolean;
  hasExecutivePod: boolean;
  hasDevPod: boolean; // legacy field - always false
  hasBountyHat: boolean;
  hasEventManagement: boolean;

  hasAdvocate: boolean; // Advocate NFT for universal bounty access
  systemBalance: string;
  selfBalance: string;
}

// Add type for cache entry
interface CacheEntry {
  data: TokenBalance;
  timestamp: number;
}

// Add type for contract call
interface ContractCall {
  target: string;
  callData: string;
}

// Add rate limiting and retry configuration - more conservative for Infura
const RATE_LIMIT = {
  maxRequests: 3, // Reduced from 5 to be more conservative
  timeWindow: 2000, // 2 seconds (increased from 1 second)
  retryAttempts: 2, // Reduced from 3 to prevent excessive retries
  retryDelay: 2000, // 2 seconds (increased from 1 second)
};

// Add request tracking
const requestTracker = {
  requests: [] as number[],
  addRequest() {
    const now = Date.now();
    this.requests = this.requests.filter(
      (time) => now - time < RATE_LIMIT.timeWindow,
    );
    this.requests.push(now);
    return this.requests.length <= RATE_LIMIT.maxRequests;
  },
};

// Add delay utility
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Add retry utility with proper typing
async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
  maxAttempts: number = RATE_LIMIT.retryAttempts,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Check rate limit
      if (!requestTracker.addRequest()) {
        console.log(
          `Rate limit reached, waiting ${RATE_LIMIT.timeWindow}ms...`,
        );
        await delay(RATE_LIMIT.timeWindow);
      }

      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.error(
        `Attempt ${attempt}/${maxAttempts} failed for ${context}:`,
        error,
      );

      if (attempt < maxAttempts) {
        const delayTime = RATE_LIMIT.retryDelay * attempt;
        console.log(`Retrying in ${delayTime}ms...`);
        await delay(delayTime);
      }
    }
  }

  throw new Error(
    `Failed after ${maxAttempts} attempts: ${lastError?.message}`,
  );
}

/**
 * Returns true if the given address is not a known placeholder.
 */
function isValidAddress(addr: string | undefined): boolean {
  const safeAddr = addr ?? '';
  if (!safeAddr) return false;
  return (
    safeAddr !== '0x0000000000000000000000000000000000000000' &&
    safeAddr !== '0x0000000000000000000000000000000000000001'
  );
}

// --- Enhanced In-Memory Cache Setup ---
const tokenBalancesCache: Record<string, CacheEntry> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes (increased from 30 seconds)

// Add a pending requests cache to prevent duplicate concurrent requests
const pendingRequests: Partial<Record<string, Promise<TokenBalance>>> = {};

export async function fetchTokenBalances(
  walletAddress: string,
): Promise<TokenBalance> {
  if (!walletAddress) {
    throw new Error('No wallet address provided');
  }

  const normalizedAddress = walletAddress.toLowerCase();
  const now = Date.now();

  // Check cache first
  if (
    tokenBalancesCache[normalizedAddress] &&
    now - tokenBalancesCache[normalizedAddress].timestamp < CACHE_TTL
  ) {
    console.log(
      `🔄 Cache hit for ${normalizedAddress.slice(0, 6)}...${normalizedAddress.slice(-4)}`,
    );
    return tokenBalancesCache[normalizedAddress].data;
  }

  // Check if there's already a pending request for this address
  if (pendingRequests[normalizedAddress]) {
    console.log(
      `⏳ Reusing pending request for ${normalizedAddress.slice(0, 6)}...${normalizedAddress.slice(-4)}`,
    );
    return await pendingRequests[normalizedAddress];
  }

  // Create and cache the pending request
  const fetchPromise = async (): Promise<TokenBalance> => {
    console.log(
      `🔍 Fetching fresh token balances for ${normalizedAddress.slice(0, 6)}...${normalizedAddress.slice(-4)}`,
    );

    try {
      const calls: ContractCall[] = [];
      let proofIndex = -1;
      let systemIndex = -1;
      let selfIndex = -1;
      let executivePodLeaderIndex = -1;
      let advocateIndex = -1;

      // --- Proof of Curiosity (ERC721) ---
      if (isValidAddress((PROOF_OF_CURIOSITY_CONTRACT ?? '') as string)) {
        try {
          const proofContract = new web3.eth.Contract(
            erc721Abi as any,
            (PROOF_OF_CURIOSITY_CONTRACT ?? '') as string,
          );
          proofIndex = calls.length;
          calls.push({
            target: (PROOF_OF_CURIOSITY_CONTRACT ?? '') as string,
            callData: proofContract.methods
              .balanceOf(walletAddress)
              .encodeABI(),
          });
        } catch (error) {
          console.error('Error setting up Proof of Curiosity call:', error);
        }
      }

      // --- System Token (ERC20) ---
      console.error('[DEBUG] 💰 System Token Setup:');
      console.error('  SYSTEM_TOKEN_CONTRACT:', SYSTEM_TOKEN_CONTRACT);
      console.error('  isValidAddress check:', isValidAddress(SYSTEM_TOKEN_CONTRACT ?? ''));
      console.error('  Wallet Address:', walletAddress);

      if (isValidAddress(SYSTEM_TOKEN_CONTRACT ?? '')) {
        try {
          const systemContract = new web3.eth.Contract(
            erc20Abi as any,
            (SYSTEM_TOKEN_CONTRACT ?? '') as string,
          );
          systemIndex = calls.length;
          const callData = systemContract.methods.balanceOf(walletAddress).encodeABI();
          calls.push({
            target: (SYSTEM_TOKEN_CONTRACT ?? '') as string,
            callData: callData,
          });
          console.error('[DEBUG] ✅ System Token call added at index:', systemIndex);
          console.error('[DEBUG]   Target:', SYSTEM_TOKEN_CONTRACT);
          console.error('[DEBUG]   CallData:', callData);
        } catch (error) {
          console.error('[ERROR] ❌ Error setting up System Token call:', error);
        }
      } else {
        console.error('[DEBUG] ⚠️ System Token contract address is invalid/placeholder. Using balance 0.');
      }

      // --- Self Token (ERC20) ---
      console.error('[DEBUG] 💰 Self Token Setup:');
      console.error('  SELF_TOKEN_CONTRACT:', SELF_TOKEN_CONTRACT);
      console.error('  isValidAddress check:', isValidAddress(SELF_TOKEN_CONTRACT ?? ''));
      console.error('  Wallet Address:', walletAddress);

      if (isValidAddress(SELF_TOKEN_CONTRACT ?? '')) {
        try {
          const selfContract = new web3.eth.Contract(
            erc20Abi as any,
            (SELF_TOKEN_CONTRACT ?? '') as string,
          );
          selfIndex = calls.length;
          const callData = selfContract.methods.balanceOf(walletAddress).encodeABI();
          calls.push({
            target: (SELF_TOKEN_CONTRACT ?? '') as string,
            callData: callData,
          });
          console.error('[DEBUG] ✅ Self Token call added at index:', selfIndex);
          console.error('[DEBUG]   Target:', SELF_TOKEN_CONTRACT);
          console.error('[DEBUG]   CallData:', callData);
        } catch (error) {
          console.error('[ERROR] ❌ Error setting up Self Token call:', error);
        }
      } else {
        console.error('[DEBUG] ⚠️ Self Token contract address is invalid/placeholder. Using balance 0.');
      }

      // --- Advocate NFT (ERC721) ---
      if (isValidAddress(ADVOCATE_TOKEN_CONTRACT)) {
        try {
          const advocateContract = new web3.eth.Contract(
            erc721Abi as any,
            ADVOCATE_TOKEN_CONTRACT,
          );
          advocateIndex = calls.length;
          calls.push({
            target: ADVOCATE_TOKEN_CONTRACT,
            callData: advocateContract.methods
              .balanceOf(walletAddress)
              .encodeABI(),
          });
          console.log('  ✅ Advocate NFT call added at index:', advocateIndex);
        } catch (error) {
          console.error('Error setting up Advocate NFT call:', error);
        }
      }

      // Market Admin Token (ERC20) removed - replaced by Market Management Hat (ERC1155)

      // --- Executive Pod Leader Token (ERC1155) ---
      console.log('🔍 Executive Pod Token Setup:');
      console.log('  HATS_CONTRACT:', HATS_CONTRACT);
      console.log('  EXECUTIVE_POD_LEADER:', EXECUTIVE_POD_HAT_ID);
      console.log('  Wallet Address:', walletAddress);

      if (isValidAddress(HATS_CONTRACT ?? '')) {
        const leaderHatId = EXECUTIVE_POD_HAT_ID || '0';
        if (leaderHatId && leaderHatId !== '0') {
          try {
            const hatsContract = new web3.eth.Contract(
              erc1155Abi as any,
              (HATS_CONTRACT ?? '') as string,
            );
            executivePodLeaderIndex = calls.length;
            calls.push({
              target: (HATS_CONTRACT ?? '') as string,
              callData: hatsContract.methods
                .balanceOf(walletAddress, leaderHatId)
                .encodeABI(),
            });
            console.log(
              '  ✅ Executive Pod LEADER Token call added at index:',
              executivePodLeaderIndex,
            );
          } catch (error) {
            console.error(
              '  ❌ Error setting up Executive Pod Leader call:',
              error,
            );
          }
        }
      } else {
        console.warn(
          '  ❌ HATS_CONTRACT is not valid; cannot check Executive Pod Token.',
        );
      }

      // --- Bounty Hat Token (ERC1155) ---
      let bountyHatIndex = -1;
      if (isValidAddress(HATS_CONTRACT ?? '')) {
        const bountyHatId = BOUNTY_HAT_ID ?? '0';
        if (bountyHatId) {
          try {
            const hatsContract = new web3.eth.Contract(
              erc1155Abi as any,
              (HATS_CONTRACT ?? '') as string,
            );
            bountyHatIndex = calls.length;
            calls.push({
              target: (HATS_CONTRACT ?? '') as string,
              callData: hatsContract.methods
                .balanceOf(walletAddress, bountyHatId)
                .encodeABI(),
            });
          } catch (error) {
            console.error('Error setting up Bounty Hat Token call:', error);
          }
        } else {
          console.warn(
            'Bounty Hat ID is not defined; defaulting to balance 0.',
          );
        }
      } else {
        console.warn(
          'HATS_CONTRACT is not valid; cannot check Bounty Hat Token.',
        );
      }

      // --- Market Management Hat Token (ERC1155) ---
      let marketManagementIndex = -1;
      if (isValidAddress(HATS_CONTRACT ?? '')) {
        const marketMgmtHatId = MARKET_MANAGEMENT_HAT_ID ?? '0';
        if (marketMgmtHatId) {
          try {
            const hatsContract = new web3.eth.Contract(
              erc1155Abi as any,
              (HATS_CONTRACT ?? '') as string,
            );
            marketManagementIndex = calls.length;
            calls.push({
              target: (HATS_CONTRACT ?? '') as string,
              callData: hatsContract.methods
                .balanceOf(walletAddress, marketMgmtHatId)
                .encodeABI(),
            });
          } catch (error) {
            console.error(
              'Error setting up Market Management Hat Token call:',
              error,
            );
          }
        } else {
          console.warn(
            'Market Management Hat ID is not defined; defaulting to balance 0.',
          );
        }
      } else {
        console.warn(
          'HATS_CONTRACT is not valid; cannot check Market Management Hat Token.',
        );
      }

      // --- Event Management Hat Token (ERC1155) ---
      let eventManagementIndex = -1;
      if (isValidAddress(HATS_CONTRACT ?? '')) {
        const eventMgmtHatId = EVENT_MANAGEMENT_HAT_ID ?? '0';
        if (eventMgmtHatId) {
          try {
            const hatsContract = new web3.eth.Contract(
              erc1155Abi as any,
              (HATS_CONTRACT ?? '') as string,
            );
            eventManagementIndex = calls.length;
            calls.push({
              target: (HATS_CONTRACT ?? '') as string,
              callData: hatsContract.methods
                .balanceOf(walletAddress, eventMgmtHatId)
                .encodeABI(),
            });
          } catch (error) {
            console.error(
              'Error setting up Event Management Hat Token call:',
              error,
            );
          }
        } else {
          console.warn(
            'Event Management Hat ID is not defined; defaulting to balance 0.',
          );
        }
      } else {
        console.warn(
          'HATS_CONTRACT is not valid; cannot check Event Management Hat Token.',
        );
      }

      // Execute multicall with retry logic and proper typing
      const multicallContract = new web3.eth.Contract(
        multicallAbi as any,
        (MULTICALL_ADDRESS ?? '') as string,
      );

      type MulticallResult = { blockNumber: string; returnData: string[] };
      const result = await withRetry<MulticallResult>(
        () => multicallContract.methods.aggregate(calls).call(),
        'multicall aggregate',
      );

      const blockNumber = result.blockNumber;
      const returnData = result.returnData;
      console.error(`[DEBUG] 📦 Multicall successful at block ${blockNumber}`);
      console.error('[DEBUG] 📦 Total returnData entries:', returnData.length);
      console.error('[DEBUG] 📦 Full returnData array:', JSON.stringify(returnData, null, 2));

      // Process results with error handling and proper typing
      const balances: TokenBalance = {
        hasProofOfCuriosity: false,
        hasMarketAdmin: false, // Backward compatibility
        hasMarketManagement: false,
        hasExecutivePod: false,
        hasDevPod: false,
        hasBountyHat: false,
        hasEventManagement: false,
        hasAdvocate: false,
        systemBalance: '0',
        selfBalance: '0',
      };

      try {
        if (proofIndex >= 0 && returnData[proofIndex]) {
          const proofBalance = web3.utils.hexToNumberString(
            (returnData[proofIndex] ?? '0') as string,
          );
          balances.hasProofOfCuriosity = Number(proofBalance) > 0;
        }
      } catch (error) {
        console.error('Error processing Proof of Curiosity balance:', error);
      }

      console.error('[DEBUG] 💰 Processing System Token balance:');
      console.error('  systemIndex:', systemIndex);
      console.error('  returnData.length:', returnData.length);
      console.error('  returnData[systemIndex]:', systemIndex >= 0 ? returnData[systemIndex] : 'N/A');

      try {
        if (systemIndex >= 0 && returnData[systemIndex]) {
          const systemBalance = (returnData[systemIndex] ?? '0') as string;
          console.error('[DEBUG]   Raw hex balance:', systemBalance);
          balances.systemBalance = web3.utils.fromWei(systemBalance, 'ether');
          console.error('[DEBUG]   Converted balance:', balances.systemBalance);
        } else {
          console.error('[DEBUG] ⚠️ systemIndex invalid or no return data');
        }
      } catch (error) {
        console.error('[ERROR] ❌ Error processing System Token balance:', error);
      }

      console.error('[DEBUG] 💰 Processing Self Token balance:');
      console.error('  selfIndex:', selfIndex);
      console.error('  returnData.length:', returnData.length);
      console.error('  returnData[selfIndex]:', selfIndex >= 0 ? returnData[selfIndex] : 'N/A');

      try {
        if (selfIndex >= 0 && returnData[selfIndex]) {
          const selfBalance = (returnData[selfIndex] ?? '0') as string;
          console.error('[DEBUG]   Raw hex balance:', selfBalance);
          balances.selfBalance = web3.utils.fromWei(selfBalance, 'ether');
          console.error('[DEBUG]   Converted balance:', balances.selfBalance);
        } else {
          console.error('[DEBUG] ⚠️ selfIndex invalid or no return data');
        }
      } catch (error) {
        console.error('[ERROR] ❌ Error processing Self Token balance:', error);
      }

      // Market Admin balance processing removed - replaced by Market Management Hat processing

      console.log('🎯 Processing Executive Pod Token balance:');
      console.log('  executivePodLeaderIndex:', executivePodLeaderIndex);
      console.log('  returnData length:', returnData.length);

      try {
        if (executivePodLeaderIndex >= 0 && returnData[executivePodLeaderIndex]) {
          const leaderBalance = web3.utils.hexToNumberString(
            (returnData[executivePodLeaderIndex] ?? '0') as string,
          );
          balances.hasExecutivePod = Number(leaderBalance) > 0;
          if (balances.hasExecutivePod) console.log('  ✅ Has Executive Pod LEADER Token!');
        }
      } catch (error) {
        console.error(
          '  ❌ Error processing Executive Pod Token balance:',
          error,
        );
      }

      try {
        if (bountyHatIndex >= 0 && returnData[bountyHatIndex]) {
          const bountyHatBalance = web3.utils.hexToNumberString(
            (returnData[bountyHatIndex] ?? '0') as string,
          );
          balances.hasBountyHat = Number(bountyHatBalance) > 0;
        }
      } catch (error) {
        console.error('Error processing Bounty Hat balance:', error);
      }

      try {
        if (marketManagementIndex >= 0 && returnData[marketManagementIndex]) {
          const marketManagementBalance = web3.utils.hexToNumberString(
            (returnData[marketManagementIndex] ?? '0') as string,
          );
          const hasMarketMgmt = Number(marketManagementBalance) > 0;
          balances.hasMarketManagement = hasMarketMgmt;
          balances.hasMarketAdmin = hasMarketMgmt; // Backward compatibility mapping
        }
      } catch (error) {
        console.error('Error processing Market Management Hat balance:', error);
      }

      try {
        if (eventManagementIndex >= 0 && returnData[eventManagementIndex]) {
          const eventManagementBalance = web3.utils.hexToNumberString(
            (returnData[eventManagementIndex] ?? '0') as string,
          );
          balances.hasEventManagement = Number(eventManagementBalance) > 0;
        }
      } catch (error) {
        console.error('Error processing Event Management Hat balance:', error);
      }

      try {
        if (advocateIndex >= 0 && returnData[advocateIndex]) {
          const advocateBalance = web3.utils.hexToNumberString(
            (returnData[advocateIndex] ?? '0') as string,
          );
          balances.hasAdvocate = Number(advocateBalance) > 0;
          console.log(
            '  ✅ Advocate NFT balance:',
            advocateBalance,
            'hasAdvocate:',
            balances.hasAdvocate,
          );
        }
      } catch (error) {
        console.error('Error processing Advocate NFT balance:', error);
      }

      // Log final results
      console.log(
        '📊 Final Token Balances for',
        normalizedAddress.slice(0, 6) +
          '...' +
          normalizedAddress.slice(-4) +
          ':',
      );
      console.log('  hasExecutivePod:', balances.hasExecutivePod);
      console.log('  hasMarketManagement:', balances.hasMarketManagement);
      console.log('  hasBountyHat:', balances.hasBountyHat);
      console.log('  hasEventManagement:', balances.hasEventManagement);
      console.log('  hasProofOfCuriosity:', balances.hasProofOfCuriosity);
      console.log('  hasAdvocate:', balances.hasAdvocate);

      // Cache the results
      tokenBalancesCache[normalizedAddress] = {
        data: balances,
        timestamp: now,
      };

      return balances;
    } catch (error) {
      console.error('Error in fetchTokenBalances:', error);

      // Return cached data if available, even if expired, as fallback
      if (tokenBalancesCache[normalizedAddress]) {
        console.log('🚨 Using expired cache data as fallback due to RPC error');
        return tokenBalancesCache[normalizedAddress].data;
      }

      // Return default values on error as last resort
      return {
        hasProofOfCuriosity: false,
        hasMarketAdmin: false, // Backward compatibility
        hasMarketManagement: false,
        hasExecutivePod: false,
        hasDevPod: false,
        hasBountyHat: false,
        hasEventManagement: false,
        hasAdvocate: false,
        systemBalance: '0',
        selfBalance: '0',
      };
    }
  };

  // Store the promise and execute it
  pendingRequests[normalizedAddress] = fetchPromise();

  try {
    const result = await pendingRequests[normalizedAddress];
    return result;
  } finally {
    // Clean up the pending request
    delete pendingRequests[normalizedAddress];
  }
}

// Export the bounty-specific interface for the bounty system
export interface BountyTokenBalances {
  hasExecutivePod: boolean;
  hasDevPod: boolean;
  hasMarketManagement: boolean;
  hasBountyHat: boolean;
  hasEventManagement: boolean;
  hasAdvocate: boolean; // Universal verified member access
}

// Helper function for bounty system to check if user can create bounties
export const checkBountyPermissions = async (
  address: string,
): Promise<BountyTokenBalances> => {
  const balances = await fetchTokenBalances(address);
  return {
    hasExecutivePod: balances.hasExecutivePod,
    hasDevPod: balances.hasDevPod,
    hasMarketManagement: balances.hasMarketManagement,
    hasBountyHat: balances.hasBountyHat,
    hasEventManagement: balances.hasEventManagement,
    hasAdvocate: balances.hasAdvocate,
  };
};

// Helper function for event system to check if user can manage events
export const checkEventManagementPermissions = async (
  address: string,
): Promise<{ hasEventManagement: boolean }> => {
  const balances = await fetchTokenBalances(address);
  return {
    hasEventManagement: balances.hasEventManagement,
  };
};

// Extended token balances function for ERC1155/Hat token checks (used by forum admin middleware)
export const fetchExtendedTokenBalances = async (
  walletAddress: string,
  erc1155Address?: `0x${string}`,
  tokenId?: number,
): Promise<{
  hasProofOfCuriosity: boolean;
  hasMarketAdmin: boolean;
  hasERC1155Token: boolean;
  systemBalance: bigint;
  selfBalance: bigint;
}> => {
  try {
    // Get base token balances
    const baseBalances = await fetchTokenBalances(walletAddress);

    // Check specific ERC1155 token if provided
    let hasERC1155Token = false;
    if (
      erc1155Address &&
      tokenId !== undefined &&
      isValidAddress(erc1155Address)
    ) {
      try {
        const calls: ContractCall[] = [];
        const hatsContract = new web3.eth.Contract(
          erc1155Abi as any,
          erc1155Address,
        );
        calls.push({
          target: erc1155Address,
          callData: hatsContract.methods
            .balanceOf(walletAddress, tokenId)
            .encodeABI(),
        });

        const multicallContract = new web3.eth.Contract(
          multicallAbi as any,
          (MULTICALL_ADDRESS ?? '') as string,
        );
        const result = await withRetry<{
          blockNumber: string;
          returnData: string[];
        }>(
          () => multicallContract.methods.aggregate(calls).call(),
          'fetchExtendedTokenBalances multicall',
        );

        if (result.returnData[0]) {
          const balance = web3.utils.hexToNumberString(result.returnData[0]);
          hasERC1155Token = Number(balance) > 0;
        }
      } catch (error) {
        console.error('Error checking ERC1155 token balance:', error);
      }
    }

    return {
      hasProofOfCuriosity: baseBalances.hasProofOfCuriosity,
      hasMarketAdmin: baseBalances.hasMarketManagement, // Map to market management since hasMarketAdmin is deprecated
      hasERC1155Token,
      systemBalance: BigInt(
        Number.parseFloat(baseBalances.systemBalance) * 1e18,
      ), // Convert to wei
      selfBalance: BigInt(Number.parseFloat(baseBalances.selfBalance) * 1e18), // Convert to wei
    };
  } catch (error) {
    console.error('Error in fetchExtendedTokenBalances:', error);
    return {
      hasProofOfCuriosity: false,
      hasMarketAdmin: false,
      hasERC1155Token: false,
      systemBalance: 0n,
      selfBalance: 0n,
    };
  }
};
