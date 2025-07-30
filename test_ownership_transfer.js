const { ethers } = require('ethers');

const PROVIDER_URL = 'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50';
const PRIVATE_KEY = '43ba409097d6e533a98435b319e3052b5e827b98c163de221db2076555a9e97b';

const EVENT_SYSTEM_FACTORY = '0x03432e12E9C6e3D0566727E7768C42f98dDF29d7';
const EVENT_REGISTRATION_FACTORY = '0xA346d2086c4B34598f2A133C32f79330aC30565f';
const EVENT_COMPLETION_FACTORY = '0x52d652b40a9b763FD673D1e09ad267775F2786C5';

async function testOwnershipTransfer() {
  try {
    console.log('🧪 Testing Ownership Transfer...\n');
    
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log(`Your wallet: ${wallet.address}`);
    console.log(`Target owner: ${EVENT_SYSTEM_FACTORY}\n`);
    
    const transferABI = [
      {
        "inputs": [],
        "name": "owner",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
      },
      {
        "inputs": [{"internalType": "address", "name": "newOwner", "type": "address"}],
        "name": "transferOwnership",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }
    ];
    
    // Test EventRegistrationFactory transfer
    console.log('📋 EventRegistrationFactory Transfer Test:');
    const regFactory = new ethers.Contract(EVENT_REGISTRATION_FACTORY, transferABI, wallet);
    
    try {
      // Check current owner
      const currentOwner = await regFactory.owner();
      console.log(`Current owner: ${currentOwner}`);
      console.log(`You are owner: ${currentOwner.toLowerCase() === wallet.address.toLowerCase()}`);
      
      if (currentOwner.toLowerCase() === wallet.address.toLowerCase()) {
        console.log('✅ You own this contract - transfer should work');
        
        // Estimate gas for transfer
        const gasEstimate = await regFactory.transferOwnership.estimateGas(EVENT_SYSTEM_FACTORY);
        console.log(`Gas estimate: ${gasEstimate.toString()}`);
        
        // Check if target address is valid
        if (EVENT_SYSTEM_FACTORY === '0x0000000000000000000000000000000000000000') {
          console.log('❌ Target address is zero - this would fail');
        } else {
          console.log('✅ Target address is valid');
        }
        
      } else {
        console.log('❌ You do not own this contract');
      }
      
    } catch (error) {
      console.error('❌ EventRegistrationFactory transfer test failed:', error.message);
    }
    
    console.log('\n📋 EventCompletionFactory Transfer Test:');
    const compFactory = new ethers.Contract(EVENT_COMPLETION_FACTORY, transferABI, wallet);
    
    try {
      // Check current owner
      const currentOwner = await compFactory.owner();
      console.log(`Current owner: ${currentOwner}`);
      console.log(`You are owner: ${currentOwner.toLowerCase() === wallet.address.toLowerCase()}`);
      
      if (currentOwner.toLowerCase() === wallet.address.toLowerCase()) {
        console.log('✅ You own this contract - transfer should work');
        
        // Estimate gas for transfer
        const gasEstimate = await compFactory.transferOwnership.estimateGas(EVENT_SYSTEM_FACTORY);
        console.log(`Gas estimate: ${gasEstimate.toString()}`);
        
      } else {
        console.log('❌ You do not own this contract');
      }
      
    } catch (error) {
      console.error('❌ EventCompletionFactory transfer test failed:', error.message);
    }
    
    console.log('\n💡 CONCLUSION:');
    console.log('If gas estimates work, the transfers should succeed.');
    console.log('If you\'re seeing 0x0000 in MetaMask, it might be a UI issue.');
    console.log('Try the transfer directly via this script instead.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testOwnershipTransfer();