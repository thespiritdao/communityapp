const { ethers } = require('ethers');

// Contract details
const CONTRACT_ADDRESS = '0x4b76eF4DCBcF1249B58d024F81f941Ab4534540c';
const YOUR_WALLET = '0x12a0cf22D632c859B793F852af03b9d515580244';

// Simple ABI for owner() function
const ownerABI = [
  "function owner() view returns (address)"
];

async function checkOwnership() {
  try {
    console.log('=== CONTRACT OWNERSHIP CHECK ===');
    console.log('Contract:', CONTRACT_ADDRESS);
    console.log('Your Wallet:', YOUR_WALLET);
    console.log('');

    // Create provider
    const provider = new ethers.JsonRpcProvider(process.env.NEXT_PUBLIC_RPC_URL);
    
    // Create contract instance
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ownerABI, provider);
    
    // Check owner
    const owner = await contract.owner();
    console.log('Contract Owner:', owner);
    console.log('Is Owner Match:', owner.toLowerCase() === YOUR_WALLET.toLowerCase());
    
    if (owner.toLowerCase() === YOUR_WALLET.toLowerCase()) {
      console.log('✅ SUCCESS: You are the owner of this contract');
    } else {
      console.log('❌ PROBLEM: You are NOT the owner of this contract');
      console.log('   This explains why transactions fail with "execution reverted"');
    }
    
  } catch (error) {
    console.error('Error checking ownership:', error.message);
  }
}

checkOwnership();