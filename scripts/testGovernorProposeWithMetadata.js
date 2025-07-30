const { ethers } = require('ethers');
const fs = require('fs');
require('dotenv').config();

// --- CONFIG ---
const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR || '0x831cC408B5F5C7cD6EF877e3e6f48c04e53FD7de';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || process.env.RPC_URL || 'https://mainnet.base.org'; // Change to your network if needed
const PRIVATE_KEY = process.env.TEST_PRIVATE_KEY; // Use a test wallet with no funds
const ABI_PATH = 'src/abis/DAO_GovernorABI.json'; // Path to ABI JSON

// --- LOAD ABI ---
let abi;
try {
  abi = JSON.parse(fs.readFileSync(ABI_PATH, 'utf8'));
} catch (e) {
  console.error('Failed to load ABI:', ABI_PATH);
  process.exit(1);
}

console.log(abi.find(f => f.name === 'proposeWithMetadata'));

// --- MAIN ---
async function main() {
  if (!PRIVATE_KEY) {
    console.error('Set TEST_PRIVATE_KEY in your .env file (use a test wallet!)');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(GOVERNOR_ADDRESS, abi, wallet);

  // --- SAMPLE ARGS ---
  // Replace with real values if needed
  const targets = [wallet.address]; // Dummy target
  const values = [0];
  const calldatas = ['0x'];
  const description = 'Test proposal for simulation';
  const title = 'Test Title';
  const forumThreadId = 'test-thread-123';

  try {
    console.log('Simulating proposeWithMetadata...');
    const proposalId = await contract.proposeWithMetadata.staticCall(
      targets,
      values,
      calldatas,
      description,
      title,
      forumThreadId
    );
    console.log('Simulation succeeded! ProposalId would be:', proposalId.toString());
  } catch (err) {
    console.error('Simulation failed!');
    if (err.error && err.error.data && err.error.data.message) {
      console.error('Revert reason:', err.error.data.message);
    } else if (err.reason) {
      console.error('Revert reason:', err.reason);
    } else {
      console.error(err);
    }
  }
}

main(); 