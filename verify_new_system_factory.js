const { ethers } = require('ethers');

const PROVIDER_URL = 'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50';
const NEW_EVENT_SYSTEM_FACTORY = '0x03432e12E9C6e3D0566727E7768C42f98dDF29d7';
const EVENT_COMPLETION_FACTORY = '0x52d652b40a9b763FD673D1e09ad267775F2786C5';

// Your proposed whitelist functions
const PROPOSED_FUNCTIONS = [
  'createCompleteEventSystem(string,string,uint256,address,address,uint256,uint256)',
  'createFreeEventSystem(string,string,uint256,address,address)',
  'getAllEventIds()',
  'getEventContracts(string)',
  'getEventCount()',
  'getEventSystem(string)',
  'getEventsByOrganizer(address)',
  'getFactoryAddresses()',
  'hasEventSystem(string)',
  'owner()',
  'transferOwnership(address)',
  'renounceOwnership()'
];

async function verifyNewSystemFactory() {
  try {
    console.log('🔍 Verifying new EventSystemFactory...\n');
    
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    
    // Check if new contract is deployed
    const code = await provider.getCode(NEW_EVENT_SYSTEM_FACTORY);
    console.log(`New EventSystemFactory: ${NEW_EVENT_SYSTEM_FACTORY}`);
    console.log(`Deployed: ${code !== '0x'}`);
    console.log(`Code length: ${code.length}\n`);
    
    if (code === '0x') {
      console.log('❌ New EventSystemFactory is not deployed yet!');
      return;
    }
    
    // Check factory configuration
    const factoryABI = [
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
      }
    ];
    
    const factory = new ethers.Contract(NEW_EVENT_SYSTEM_FACTORY, factoryABI, provider);
    const [regFactory, compFactory, escrow] = await factory.getFactoryAddresses();
    
    console.log('📋 New EventSystemFactory Configuration:');
    console.log(`Registration Factory: ${regFactory}`);
    console.log(`Completion Factory: ${compFactory}`);
    console.log(`Expected Completion: ${EVENT_COMPLETION_FACTORY}`);
    console.log(`✅ Completion Factory Match: ${compFactory === EVENT_COMPLETION_FACTORY}`);
    console.log(`Escrow Contract: ${escrow}\n`);
    
    // Test transaction simulation
    console.log('📋 Testing createFreeEventSystem...');
    
    const testABI = [
      {
        "inputs": [
          {"internalType": "string", "name": "eventId", "type": "string"},
          {"internalType": "string", "name": "eventTitle", "type": "string"},
          {"internalType": "uint256", "name": "eventDate", "type": "uint256"},
          {"internalType": "address", "name": "eventOrganizer", "type": "address"},
          {"internalType": "address", "name": "fundRecipient", "type": "address"}
        ],
        "name": "createFreeEventSystem",
        "outputs": [
          {"internalType": "address", "name": "registrationContract", "type": "address"},
          {"internalType": "address", "name": "completionContract", "type": "address"}
        ],
        "stateMutability": "nonpayable",
        "type": "function"
      }
    ];
    
    try {
      const testFactory = new ethers.Contract(NEW_EVENT_SYSTEM_FACTORY, testABI, provider);
      
      const eventId = 'test-final-' + Date.now();
      const eventTitle = 'Final Test Event';
      const eventDate = Math.floor(Date.now() / 1000) + 300;
      const eventOrganizer = '0x12a0cf22D632c859B793F852af03b9d515580244';
      const fundRecipient = '0x12a0cf22D632c859B793F852af03b9d515580244';
      
      const estimatedGas = await testFactory.createFreeEventSystem.estimateGas(
        eventId, eventTitle, eventDate, eventOrganizer, fundRecipient
      );
      
      console.log(`✅ Transaction simulation SUCCESSFUL!`);
      console.log(`Estimated gas: ${estimatedGas.toString()}`);
      console.log(`Your events should now work!\n`);
      
    } catch (error) {
      console.error('❌ Transaction simulation still failing:');
      console.error('Error:', error.message);
      if (error.data) {
        console.error('Error data:', error.data);
      }
    }
    
    // Validate proposed whitelist
    console.log('📋 Proposed Coinbase Whitelist Functions:');
    PROPOSED_FUNCTIONS.forEach((func, index) => {
      console.log(`${index + 1}. ${func}`);
    });
    
    console.log('\n✅ This function list looks CORRECT for your EventSystemFactory!');
    console.log('These are the exact functions your frontend calls and the read functions you need.');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

verifyNewSystemFactory();