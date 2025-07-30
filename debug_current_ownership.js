const { ethers } = require('ethers');

const PROVIDER_URL = 'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50';
const EVENT_REGISTRATION_FACTORY = '0xA346d2086c4B34598f2A133C32f79330aC30565f';
const EVENT_COMPLETION_FACTORY = '0x52d652b40a9b763FD673D1e09ad267775F2786C5';
const YOUR_ADDRESS = '0x12a0cf22D632c859B793F852af03b9d515580244';

async function debugCurrentOwnership() {
  try {
    console.log('🔍 Debugging Current Factory Ownership...\n');
    
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    
    const ownerABI = [
      {
        "inputs": [],
        "name": "owner",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
      }
    ];
    
    // Check EventRegistrationFactory
    console.log('📋 EventRegistrationFactory:');
    console.log(`Address: ${EVENT_REGISTRATION_FACTORY}`);
    
    try {
      const regFactory = new ethers.Contract(EVENT_REGISTRATION_FACTORY, ownerABI, provider);
      const regOwner = await regFactory.owner();
      console.log(`Owner: ${regOwner}`);
      console.log(`Is Zero Address: ${regOwner === '0x0000000000000000000000000000000000000000'}`);
      console.log(`Is Your Address: ${regOwner === YOUR_ADDRESS}\n`);
    } catch (error) {
      console.error('❌ Failed to get EventRegistrationFactory owner:', error.message);
      console.log('This might mean the contract doesn\'t have an owner() function\n');
    }
    
    // Check EventCompletionFactory  
    console.log('📋 EventCompletionFactory:');
    console.log(`Address: ${EVENT_COMPLETION_FACTORY}`);
    
    try {
      const compFactory = new ethers.Contract(EVENT_COMPLETION_FACTORY, ownerABI, provider);
      const compOwner = await compFactory.owner();
      console.log(`Owner: ${compOwner}`);
      console.log(`Is Zero Address: ${compOwner === '0x0000000000000000000000000000000000000000'}`);
      console.log(`Is Your Address: ${compOwner === YOUR_ADDRESS}\n`);
    } catch (error) {
      console.error('❌ Failed to get EventCompletionFactory owner:', error.message);
      console.log('This might mean the contract doesn\'t have an owner() function\n');
    }
    
    // Check if contracts are actually deployed
    const regCode = await provider.getCode(EVENT_REGISTRATION_FACTORY);
    const compCode = await provider.getCode(EVENT_COMPLETION_FACTORY);
    
    console.log('📋 Contract Deployment Status:');
    console.log(`EventRegistrationFactory deployed: ${regCode !== '0x'} (${regCode.length} bytes)`);
    console.log(`EventCompletionFactory deployed: ${compCode !== '0x'} (${compCode.length} bytes)\n`);
    
    // Look for constructor issues
    console.log('🔍 POSSIBLE ISSUES:');
    console.log('1. Contracts deployed with address(0) as initialOwner');
    console.log('2. Constructor reverted and set owner to zero');
    console.log('3. Contracts don\'t inherit from Ownable properly');
    console.log('4. Ownership was renounced (set to zero)');
    
    // Check if there are any ownership transfer events
    console.log('\n📋 Checking for OwnershipTransferred events...');
    
    const transferABI = [
      {
        "anonymous": false,
        "inputs": [
          {"indexed": true, "internalType": "address", "name": "previousOwner", "type": "address"},
          {"indexed": true, "internalType": "address", "name": "newOwner", "type": "address"}
        ],
        "name": "OwnershipTransferred",
        "type": "event"
      }
    ];
    
    // Look for ownership events on both factories
    const regFactory = new ethers.Contract(EVENT_REGISTRATION_FACTORY, transferABI, provider);
    const compFactory = new ethers.Contract(EVENT_COMPLETION_FACTORY, transferABI, provider);
    
    try {
      const regEvents = await regFactory.queryFilter(regFactory.filters.OwnershipTransferred(), -10000);
      console.log(`EventRegistrationFactory ownership events: ${regEvents.length}`);
      regEvents.forEach((event, i) => {
        console.log(`  ${i+1}: ${event.args.previousOwner} → ${event.args.newOwner}`);
      });
    } catch (error) {
      console.log('No ownership events found for EventRegistrationFactory');
    }
    
    try {
      const compEvents = await compFactory.queryFilter(compFactory.filters.OwnershipTransferred(), -10000);
      console.log(`EventCompletionFactory ownership events: ${compEvents.length}`);
      compEvents.forEach((event, i) => {
        console.log(`  ${i+1}: ${event.args.previousOwner} → ${event.args.newOwner}`);
      });
    } catch (error) {
      console.log('No ownership events found for EventCompletionFactory');
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugCurrentOwnership();