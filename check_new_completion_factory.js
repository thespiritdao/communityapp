const { ethers } = require('ethers');

const PROVIDER_URL = 'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50';
const NEW_EVENT_COMPLETION_FACTORY = '0x52d652b40a9b763FD673D1e09ad267775F2786C5';
const EVENT_SYSTEM_FACTORY = '0x4b76eF4DCBcF1249B58d024F81f941Ab4534540c';

async function checkNewCompletionFactory() {
  try {
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    
    console.log('🔍 Checking new EventCompletionFactory...\n');
    
    // Check if new contract is deployed
    const code = await provider.getCode(NEW_EVENT_COMPLETION_FACTORY);
    console.log(`New EventCompletionFactory: ${NEW_EVENT_COMPLETION_FACTORY}`);
    console.log(`Deployed: ${code !== '0x'}`);
    console.log(`Code length: ${code.length}\n`);
    
    if (code === '0x') {
      console.log('❌ New EventCompletionFactory is still not deployed!');
      return;
    }
    
    // Check if EventSystemFactory knows about the new address
    console.log('📋 Checking EventSystemFactory configuration...');
    
    const systemFactoryABI = [
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
    
    const systemFactory = new ethers.Contract(EVENT_SYSTEM_FACTORY, systemFactoryABI, provider);
    const [regFactory, compFactory, escrow] = await systemFactory.getFactoryAddresses();
    
    console.log(`EventSystemFactory knows about:`);
    console.log(`  Completion Factory: ${compFactory}`);
    console.log(`  Expected (new): ${NEW_EVENT_COMPLETION_FACTORY}`);
    console.log(`  ✅ Match: ${compFactory === NEW_EVENT_COMPLETION_FACTORY}\n`);
    
    if (compFactory !== NEW_EVENT_COMPLETION_FACTORY) {
      console.log('❌ CRITICAL ISSUE: EventSystemFactory still points to old address!');
      console.log('You need to update EventSystemFactory to use the new completion factory address.');
      console.log('This requires calling a setter function on EventSystemFactory or redeploying it.');
    }
    
    // Test the new completion factory
    console.log('📋 Testing new EventCompletionFactory...');
    
    const completionFactoryABI = [
      {
        "inputs": [],
        "name": "owner",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
      }
    ];
    
    try {
      const completionFactory = new ethers.Contract(NEW_EVENT_COMPLETION_FACTORY, completionFactoryABI, provider);
      const owner = await completionFactory.owner();
      console.log(`New completion factory owner: ${owner}`);
      console.log(`Your address: 0x12a0cf22D632c859B793F852af03b9d515580244`);
      console.log(`✅ You own new factory: ${owner === '0x12a0cf22D632c859B793F852af03b9d515580244'}\n`);
    } catch (error) {
      console.error('❌ Failed to check new completion factory:', error.message);
    }
    
    // Try transaction simulation with current EventSystemFactory state
    console.log('📋 Testing createFreeEventSystem with current configuration...');
    
    const testSystemFactoryABI = [
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
      const testSystemFactory = new ethers.Contract(EVENT_SYSTEM_FACTORY, testSystemFactoryABI, provider);
      
      const eventId = 'test-new-factory-' + Date.now();
      const eventTitle = 'Test Event';
      const eventDate = Math.floor(Date.now() / 1000) + 300;
      const eventOrganizer = '0x12a0cf22D632c859B793F852af03b9d515580244';
      const fundRecipient = '0x12a0cf22D632c859B793F852af03b9d515580244';
      
      const estimatedGas = await testSystemFactory.createFreeEventSystem.estimateGas(
        eventId, eventTitle, eventDate, eventOrganizer, fundRecipient
      );
      
      console.log(`✅ Transaction simulation successful!`);
      console.log(`Estimated gas: ${estimatedGas.toString()}`);
      
    } catch (error) {
      console.error('❌ Transaction simulation still failing:');
      console.error('Error message:', error.message);
      if (error.data) {
        console.error('Error data:', error.data);
      }
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  }
}

checkNewCompletionFactory();