// src/utils/fetchTokenBalances.ts
import Web3 from "web3";
import BN from "bn.js";

// Minimal JSON ABIs for ERC20 and ERC721
const erc20Abi = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
];

const erc721Abi = [
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    type: "function",
  },
];

const erc1155Abi = [
  {
    inputs: [
      { internalType: "address", name: "account", type: "address" },
      { internalType: "uint256", name: "id", type: "uint256" }
    ],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];

// Minimal Multicall ABI (only the aggregate function)
const multicallAbi = [
  {
    constant: true,
    inputs: [
      {
        components: [
          { name: "target", type: "address" },
          { name: "callData", type: "bytes" },
        ],
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "aggregate",
    outputs: [
      { name: "blockNumber", type: "uint256" },
      { name: "returnData", type: "bytes[]" },
    ],
    payable: false,
    stateMutability: "view",
    type: "function",
  },
];

// Environment variables – adjust these to your production values.
const PROOF_OF_CURIOSITY_CONTRACT = process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY;
const SYSTEM_TOKEN_CONTRACT = process.env.NEXT_PUBLIC_SYSTEM_TOKEN;
const SELF_TOKEN_CONTRACT = process.env.NEXT_PUBLIC_SELF_TOKEN;
const MARKET_ADMIN_TOKEN_CONTRACT = process.env.NEXT_PUBLIC_MARKET_ADMIN;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
const NETWORK_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "8453");
// Set the multicall contract address – deploy your own or use a known one.
const MULTICALL_ADDRESS =
  process.env.NEXT_PUBLIC_MULTICALL_ADDRESS || "0xYourMulticallContractAddress";
  
  
 //hats
 
const HATS_CONTRACT = process.env.NEXT_PUBLIC_HATS_CONTRACT;
const EXECUTIVE_POD_HAT_ID = process.env.NEXT_PUBLIC_EXECUTIVE_POD_HAT_ID; // raw hat id (hex string)
const DEV_POD_HAT_ID = process.env.NEXT_PUBLIC_DEV_POD_HAT_ID; // raw hat id (hex string)


// Create a Web3 provider and instance.
const provider = new Web3.providers.HttpProvider(RPC_URL, { chainId: NETWORK_CHAIN_ID });
const web3 = new Web3(provider);

// Define the return interface.
export interface TokenBalances {
  hasProofOfCuriosity: boolean;
  hasMarketAdmin: boolean;
  hasExecutivePod: boolean;
  hasDevPod: boolean;
  systemBalance: string; // human-readable token amount
  selfBalance: string;   // human-readable token amount
}

/**
 * Returns true if the given address is not a known placeholder.
 */
function isValidAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  return (
    addr !== "0x0000000000000000000000000000000000000000" &&
    addr !== "0x0000000000000000000000000000000000000001"
  );
}

// --- Basic In-Memory Cache Setup ---
const tokenBalancesCache: Record<string, { data: TokenBalances; timestamp: number }> = {};
const CACHE_TTL = 30 * 1000; // 30 seconds

/**
 * Fetch token balances for the given wallet address using multicall.
 */
export async function fetchERC1155Balance(
  walletAddress: string,
  contractAddress: string,
  tokenId: string // expecting a hex string representing a uint256
): Promise<bigint> {
  try {
    const balance = await readContract({
      address: contractAddress,
      abi: erc1155Abi,
      functionName: "balanceOf",
      args: [walletAddress, tokenId],
      chainId: NETWORK_CHAIN_ID,
    });
    return balance;
  } catch (error) {
    console.error("❌ Error fetching ERC-1155 balance:", error);
    return 0n;
  }}

export async function fetchTokenBalances(walletAddress: string): Promise<TokenBalances> {
  if (!walletAddress) {
    throw new Error("No wallet address provided");
  }
  
  const now = Date.now();
  if (tokenBalancesCache[walletAddress] && (now - tokenBalancesCache[walletAddress].timestamp < CACHE_TTL)) {
    return tokenBalancesCache[walletAddress].data;
  }

  const calls: { target: string; callData: string }[] = [];
  let proofIndex = -1;
  let systemIndex = -1;
  let selfIndex = -1;
  let marketAdminIndex = -1;
  let executivePodIndex = -1;
  let devPodIndex = -1;

  // --- Proof of Curiosity (ERC721) ---
  if (isValidAddress(PROOF_OF_CURIOSITY_CONTRACT)) {
    try {
      const proofContract = new web3.eth.Contract(erc721Abi as any, PROOF_OF_CURIOSITY_CONTRACT);
      proofIndex = calls.length;
      calls.push({
        target: PROOF_OF_CURIOSITY_CONTRACT,
        callData: proofContract.methods.balanceOf(walletAddress).encodeABI(),
      });
    } catch (error) {
      console.error("Error setting up Proof of Curiosity call:", error);
    }
  } else {
    console.warn("Proof of Curiosity contract address is a placeholder. Using balance 0.");
  }

  // --- System Token (ERC20) ---
  if (isValidAddress(SYSTEM_TOKEN_CONTRACT)) {
    try {
      const systemContract = new web3.eth.Contract(erc20Abi as any, SYSTEM_TOKEN_CONTRACT);
      systemIndex = calls.length;
      calls.push({
        target: SYSTEM_TOKEN_CONTRACT,
        callData: systemContract.methods.balanceOf(walletAddress).encodeABI(),
      });
    } catch (error) {
      console.error("Error setting up System Token call:", error);
    }
  } else {
    console.warn("System Token contract address is a placeholder. Using balance 0.");
  }

  // --- Self Token (ERC20) ---
  if (isValidAddress(SELF_TOKEN_CONTRACT)) {
    try {
      const selfContract = new web3.eth.Contract(erc20Abi as any, SELF_TOKEN_CONTRACT);
      selfIndex = calls.length;
      calls.push({
        target: SELF_TOKEN_CONTRACT,
        callData: selfContract.methods.balanceOf(walletAddress).encodeABI(),
      });
    } catch (error) {
      console.error("Error setting up Self Token call:", error);
    }
  } else {
    console.warn("Self Token contract address is a placeholder. Using balance 0.");
  }

  // --- Market Admin Token (ERC20) ---
  if (isValidAddress(MARKET_ADMIN_TOKEN_CONTRACT)) {
    try {
      const marketAdminContract = new web3.eth.Contract(erc20Abi as any, MARKET_ADMIN_TOKEN_CONTRACT);
      marketAdminIndex = calls.length;
      calls.push({
        target: MARKET_ADMIN_TOKEN_CONTRACT,
        callData: marketAdminContract.methods.balanceOf(walletAddress).encodeABI(),
      });
    } catch (error) {
      console.error("Error setting up Market Admin Token call:", error);
    }
  } else {
    console.warn("Market Admin Token contract address is a placeholder or not set. Using balance 0.");
  }

	// --- Executive Pod Token (ERC1155) ---
	if (isValidAddress(HATS_CONTRACT)) {
	  const execHatId = process.env.NEXT_PUBLIC_EXECUTIVE_POD_HAT_ID;
	  if (execHatId) {
		try {
		  const hatsContract = new web3.eth.Contract(erc1155Abi as any, HATS_CONTRACT);
		  executivePodIndex = calls.length;
		  calls.push({
			target: HATS_CONTRACT,
			callData: hatsContract.methods.balanceOf(walletAddress, execHatId).encodeABI(),
		  });
		} catch (error) {
		  console.error("Error setting up Executive Pod Token call:", error);
		}
	  } else {
		console.warn("Executive Pod Hat ID is not defined; defaulting to balance 0.");
	  }
	} else {
	  console.warn("HATS_CONTRACT is not valid; cannot check Executive Pod Token.");
	}

  // --- Dev Pod Token (ERC1155) ---

	if (isValidAddress(HATS_CONTRACT)) {
	  const devHatId = process.env.NEXT_PUBLIC_DEV_POD_HAT_ID;
	  if (devHatId) {
		try {
		  const hatsContract = new web3.eth.Contract(erc1155Abi as any, HATS_CONTRACT);
		  devPodIndex = calls.length;
		  calls.push({
			target: HATS_CONTRACT,
			callData: hatsContract.methods.balanceOf(walletAddress, devHatId).encodeABI(),
		  });
		} catch (error) {
		  console.error("Error setting up Dev Pod Token call:", error);
		}
	  } else {
		console.warn("Dev Pod Hat ID is not defined; defaulting to balance 0.");
	  }
	} else {
	  console.warn("HATS_CONTRACT is not valid; cannot check Dev Pod Token.");
	}


  // --- Perform Multicall ---
  const multicallContract = new web3.eth.Contract(multicallAbi as any, MULTICALL_ADDRESS);
  let returnData: string[] = [];
  try {
    const result = await multicallContract.methods.aggregate(calls).call();
    returnData = result.returnData;
  } catch (error) {
    console.error("Error during multicall aggregate:", error);
  }

  // --- Decode Return Data ---
  let proofBalanceRaw = "0";
  if (proofIndex >= 0 && returnData[proofIndex]) {
    try {
      proofBalanceRaw = web3.eth.abi.decodeParameter("uint256", returnData[proofIndex]);
    } catch (e) {
      console.error("Error decoding Proof of Curiosity balance:", e);
      console.error("Raw return data for PoC:", returnData[proofIndex]);
      proofBalanceRaw = "0";
    }
  }
  
  const systemBalanceRaw =
    systemIndex >= 0 && returnData[systemIndex]
      ? web3.eth.abi.decodeParameter("uint256", returnData[systemIndex])
      : "0";
  const selfBalanceRaw =
    selfIndex >= 0 && returnData[selfIndex]
      ? web3.eth.abi.decodeParameter("uint256", returnData[selfIndex])
      : "0";
  const marketAdminBalanceRaw =
    marketAdminIndex >= 0 && returnData[marketAdminIndex]
      ? web3.eth.abi.decodeParameter("uint256", returnData[marketAdminIndex])
      : "0";
  
  let executivePodBalanceRaw = "0";
  if (executivePodIndex >= 0 && returnData[executivePodIndex]) {
    try {
      executivePodBalanceRaw = web3.eth.abi.decodeParameter("uint256", returnData[executivePodIndex]);
    } catch (e) {
      console.error("Error decoding Executive Pod balance:", e);
      console.error("Raw return data for Executive Pod:", returnData[executivePodIndex]);
      executivePodBalanceRaw = "0";
    }
  }
  
  let devPodBalanceRaw = "0";
  if (devPodIndex >= 0 && returnData[devPodIndex]) {
    try {
      devPodBalanceRaw = web3.eth.abi.decodeParameter("uint256", returnData[devPodIndex]);
    } catch (e) {
      console.error("Error decoding Dev Pod balance:", e);
      console.error("Raw return data for Dev Pod:", returnData[devPodIndex]);
      devPodBalanceRaw = "0";
    }
  }

  const systemBalanceHuman = web3.utils.fromWei(systemBalanceRaw, "ether");
  const selfBalanceHuman = web3.utils.fromWei(selfBalanceRaw, "ether");

	const balances: TokenBalances = {
	  hasProofOfCuriosity: BigInt(proofBalanceRaw) > 0n,
	  hasMarketAdmin: BigInt(marketAdminBalanceRaw) > 0n,
	  hasExecutivePod: BigInt(executivePodBalanceRaw) > 0n,
	  hasDevPod: BigInt(devPodBalanceRaw) > 0n,
	  systemBalance: systemBalanceHuman,
	  selfBalance: selfBalanceHuman,
	};


  tokenBalancesCache[walletAddress] = { data: balances, timestamp: now };

  return balances;
}
