const { ethers } = require('ethers');

// Contract details from your .env
const PROVIDER_URL = 'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50';
const EVENT_SYSTEM_FACTORY = '0x4b76eF4DCBcF1249B58d024F81f941Ab4534540c';
const EVENT_REGISTRATION_FACTORY = '0xA346d2086c4B34598f2A133C32f79330aC30565f';
const EVENT_COMPLETION_FACTORY = '0xcD6a42782d230D7c13A74ddec5dD140e55499Df9';
const EVENT_ESCROW = '0xA8b5b26281ea1DaA09AA0a78236271Cd4BeDD6Cc';

const EventSystemFactoryABI = [
  {
    "inputs": [{"internalType": "string", "name": "eventId", "type": "string"}],
    "name": "hasEventSystem",
    "outputs": [{"internalType": "bool", "name": "exists", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getFactoryAddresses",
    "outputs": [
      {"internalType": "address", "name": "regFactory", "type": "address"},
      {"internalType": "address", "name": "compFactory", "type": "address"},
      {"internalType": "address", "name": "escrow", "type": "address"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
];

async function checkContractState() {
  try {
    console.log('🔍 Checking EventSystemFactory Contract State...\n');
    
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    const contract = new ethers.Contract(EVENT_SYSTEM_FACTORY, EventSystemFactoryABI, provider);
    
    // Check factory addresses
    console.log('📋 Factory Addresses Configuration:');
    try {
      const [regFactory, compFactory, escrow] = await contract.getFactoryAddresses();
      console.log(`Registration Factory: ${regFactory}`);
      console.log(`Expected: ${EVENT_REGISTRATION_FACTORY}`);
      console.log(`✅ Match: ${regFactory === EVENT_REGISTRATION_FACTORY}\n`);
      
      console.log(`Completion Factory: ${compFactory}`);
      console.log(`Expected: ${EVENT_COMPLETION_FACTORY}`);
      console.log(`✅ Match: ${compFactory === EVENT_COMPLETION_FACTORY}\n`);
      
      console.log(`Escrow Contract: ${escrow}`);
      console.log(`Expected: ${EVENT_ESCROW}`);
      console.log(`✅ Match: ${escrow === EVENT_ESCROW}\n`);
    } catch (error) {
      console.error('❌ Failed to get factory addresses:', error.message);
    }
    
    // Check contract owner
    console.log('📋 Contract Ownership:');
    try {
      const owner = await contract.owner();
      console.log(`Contract Owner: ${owner}`);
      console.log(`Your Address: 0x12a0cf22D632c859B793F852af03b9d515580244`);
      console.log(`✅ You are owner: ${owner === '0x12a0cf22D632c859B793F852af03b9d515580244'}\n`);
    } catch (error) {
      console.error('❌ Failed to get owner:', error.message);
    }
    
    // Check if test event ID already exists
    console.log('📋 Event ID Conflict Check:');
    try {
      const eventExists = await contract.hasEventSystem('event-1753750171188-3hu8n1ds7');
      console.log(`Event ID exists: ${eventExists}`);
      if (eventExists) {
        console.log('❌ Event ID already exists - this will cause revert!\n');
      } else {
        console.log('✅ Event ID is available\n');
      }
    } catch (error) {
      console.error('❌ Failed to check event existence:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Contract check failed:', error);
  }
}

checkContractState();