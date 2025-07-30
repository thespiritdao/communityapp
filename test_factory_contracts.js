const { ethers } = require('ethers');

// Contract details
const PROVIDER_URL = 'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50';
const EVENT_REGISTRATION_FACTORY = '0xA346d2086c4B34598f2A133C32f79330aC30565f';
const EVENT_COMPLETION_FACTORY = '0xcD6a42782d230D7c13A74ddec5dD140e55499Df9';

const FactoryABI = [
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
];

async function testFactoryContracts() {
  try {
    console.log('🔍 Testing Factory Contracts...\n');
    
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    
    // Test Registration Factory
    console.log('📋 EventRegistrationFactory:');
    try {
      const regFactory = new ethers.Contract(EVENT_REGISTRATION_FACTORY, FactoryABI, provider);
      const regOwner = await regFactory.owner();
      console.log(`Owner: ${regOwner}`);
      console.log(`Your Address: 0x12a0cf22D632c859B793F852af03b9d515580244`);
      console.log(`✅ You own this factory: ${regOwner === '0x12a0cf22D632c859B793F852af03b9d515580244'}\n`);
    } catch (error) {
      console.error('❌ Registration Factory Error:', error.message, '\n');
    }
    
    // Test Completion Factory
    console.log('📋 EventCompletionFactory:');
    try {
      const compFactory = new ethers.Contract(EVENT_COMPLETION_FACTORY, FactoryABI, provider);
      const compOwner = await compFactory.owner();
      console.log(`Owner: ${compOwner}`);
      console.log(`Your Address: 0x12a0cf22D632c859B793F852af03b9d515580244`);
      console.log(`✅ You own this factory: ${compOwner === '0x12a0cf22D632c859B793F852af03b9d515580244'}\n`);
    } catch (error) {
      console.error('❌ Completion Factory Error:', error.message, '\n');
    }
    
    // Try to simulate the actual transaction
    console.log('📋 Simulating createFreeEventSystem transaction...');
    try {
      const eventId = 'test-simulation-' + Date.now();
      const eventTitle = 'Test Event';
      const eventDate = Math.floor(Date.now() / 1000) + 300; // 5 minutes from now
      const eventOrganizer = '0x12a0cf22D632c859B793F852af03b9d515580244';
      const fundRecipient = '0x12a0cf22D632c859B793F852af03b9d515580244';
      
      const systemFactoryABI = [
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
      
      const systemFactory = new ethers.Contract(
        '0x4b76eF4DCBcF1249B58d024F81f941Ab4534540c', 
        systemFactoryABI, 
        provider
      );
      
      // Try to estimate gas (this will show the exact revert reason)
      const estimatedGas = await systemFactory.createFreeEventSystem.estimateGas(
        eventId,
        eventTitle, 
        eventDate,
        eventOrganizer,
        fundRecipient
      );
      
      console.log(`✅ Gas estimation successful: ${estimatedGas.toString()}`);
      console.log('Transaction should work!');
      
    } catch (error) {
      console.error('❌ Transaction simulation failed:');
      console.error('Error code:', error.code);
      console.error('Error reason:', error.reason);
      console.error('Error message:', error.message);
      
      // Try to extract revert reason
      if (error.data) {
        console.error('Error data:', error.data);
      }
      if (error.info && error.info.error && error.info.error.message) {
        console.error('Detailed error:', error.info.error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Factory test failed:', error);
  }
}

testFactoryContracts();