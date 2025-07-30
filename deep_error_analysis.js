const { ethers } = require('ethers');

const PROVIDER_URL = 'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50';
const EVENT_SYSTEM_FACTORY = '0x03432e12E9C6e3D0566727E7768C42f98dDF29d7';
const EVENT_REGISTRATION_FACTORY = '0xA346d2086c4B34598f2A133C32f79330aC30565f';
const EVENT_COMPLETION_FACTORY = '0x52d652b40a9b763FD673D1e09ad267775F2786C5';

// Common error signatures to decode
const ERROR_SIGNATURES = {
  '0x118cdaa7': 'AddressEmptyCode(address)',
  '0xd1a57ed6': 'OwnableUnauthorizedAccount(address)',
  '0x1e4fbdf7': 'OwnableInvalidOwner(address)',
  '0x8baa579f': 'SafeCastOverflowedUintDowncast(uint8,uint256)',
  '0x4e487b71': 'Panic(uint256)',
  '0x08c379a0': 'Error(string)'
};

async function deepErrorAnalysis() {
  try {
    console.log('🔍 Deep Error Analysis for EventSystemFactory...\n');
    
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    
    // 1. Test individual factory contracts first
    console.log('📋 Step 1: Testing Individual Factory Contracts\n');
    
    // Test EventRegistrationFactory directly
    console.log('🧪 Testing EventRegistrationFactory deployment...');
    try {
      const regFactoryABI = [
        {
          "inputs": [
            {"internalType": "string", "name": "eventId", "type": "string"},
            {"internalType": "string", "name": "eventTitle", "type": "string"},
            {"internalType": "uint256", "name": "eventDate", "type": "uint256"},
            {"internalType": "address", "name": "eventOrganizer", "type": "address"}
          ],
          "name": "createEventRegistrationSystem",
          "outputs": [{"internalType": "address", "name": "contractAddress", "type": "address"}],
          "stateMutability": "nonpayable",
          "type": "function"
        }
      ];
      
      const regFactory = new ethers.Contract(EVENT_REGISTRATION_FACTORY, regFactoryABI, provider);
      
      const regGas = await regFactory.createEventRegistrationSystem.estimateGas(
        'test-reg-' + Date.now(),
        'Test Registration',
        Math.floor(Date.now() / 1000) + 300,
        '0x12a0cf22D632c859B793F852af03b9d515580244'
      );
      
      console.log(`✅ Registration Factory gas estimation: ${regGas.toString()}`);
      
    } catch (error) {
      console.error('❌ Registration Factory Error:');
      console.error('Error data:', error.data);
      
      if (error.data && ERROR_SIGNATURES[error.data.substring(0, 10)]) {
        console.error('Decoded error:', ERROR_SIGNATURES[error.data.substring(0, 10)]);
      }
      
      // Try to decode the parameter
      if (error.data && error.data.length > 10) {
        const paramData = error.data.substring(10);
        console.error('Error parameter (hex):', paramData);
        
        // Try to decode as address
        if (paramData.length >= 64) {
          const paddedAddress = paramData.substring(24, 64);
          const address = '0x' + paddedAddress;
          console.error('Address parameter:', address);
          
          if (address === '0x0000000000000000000000000000000000000000') {
            console.error('🔍 ZERO ADDRESS DETECTED! This is likely the issue.');
          }
        }
      }
    }
    
    console.log('\n🧪 Testing EventCompletionFactory deployment...');
    try {
      const compFactoryABI = [
        {
          "inputs": [
            {"internalType": "string", "name": "eventId", "type": "string"},
            {"internalType": "string", "name": "eventTitle", "type": "string"},
            {"internalType": "uint256", "name": "eventDate", "type": "uint256"},
            {"internalType": "address", "name": "eventOrganizer", "type": "address"},
            {"internalType": "address", "name": "fundRecipient", "type": "address"},
            {"internalType": "uint256", "name": "priceSystem", "type": "uint256"},
            {"internalType": "uint256", "name": "priceSelf", "type": "uint256"}
          ],
          "name": "createEventCompletionSystem",
          "outputs": [{"internalType": "address", "name": "contractAddress", "type": "address"}],
          "stateMutability": "nonpayable",
          "type": "function"
        }
      ];
      
      const compFactory = new ethers.Contract(EVENT_COMPLETION_FACTORY, compFactoryABI, provider);
      
      const compGas = await compFactory.createEventCompletionSystem.estimateGas(
        'test-comp-' + Date.now(),
        'Test Completion',
        Math.floor(Date.now() / 1000) + 300,
        '0x12a0cf22D632c859B793F852af03b9d515580244',
        '0x12a0cf22D632c859B793F852af03b9d515580244',
        0,
        0
      );
      
      console.log(`✅ Completion Factory gas estimation: ${compGas.toString()}`);
      
    } catch (error) {
      console.error('❌ Completion Factory Error:');
      console.error('Error data:', error.data);
      
      if (error.data && ERROR_SIGNATURES[error.data.substring(0, 10)]) {
        console.error('Decoded error:', ERROR_SIGNATURES[error.data.substring(0, 10)]);
      }
    }
    
    // 2. Check if contracts have the correct bytecode stored
    console.log('\n📋 Step 2: Checking Factory Contract Bytecode Storage\n');
    
    // Check if factories have NFT contract bytecode
    const regFactoryCode = await provider.getCode(EVENT_REGISTRATION_FACTORY);
    const compFactoryCode = await provider.getCode(EVENT_COMPLETION_FACTORY);
    
    console.log(`Registration Factory code length: ${regFactoryCode.length}`);
    console.log(`Completion Factory code length: ${compFactoryCode.length}`);
    
    // Look for CREATE2 or CREATE opcodes in bytecode (hex 60 for CREATE2, hex f0 for CREATE)
    const hasCreate2Reg = regFactoryCode.includes('60') || regFactoryCode.includes('f0');
    const hasCreate2Comp = compFactoryCode.includes('60') || compFactoryCode.includes('f0');
    
    console.log(`Registration Factory has CREATE opcodes: ${hasCreate2Reg}`);
    console.log(`Completion Factory has CREATE opcodes: ${hasCreate2Comp}`);
    
    // 3. Test with minimal parameters to isolate the issue
    console.log('\n📋 Step 3: Testing EventSystemFactory with Debug Info\n');
    
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
    
    const systemFactory = new ethers.Contract(EVENT_SYSTEM_FACTORY, systemFactoryABI, provider);
    
    try {
      // Try with very simple parameters
      const gas = await systemFactory.createFreeEventSystem.estimateGas(
        'x',  // Minimal event ID
        'x',  // Minimal title  
        Math.floor(Date.now() / 1000) + 300,
        '0x12a0cf22D632c859B793F852af03b9d515580244',
        '0x12a0cf22D632c859B793F852af03b9d515580244'
      );
      
      console.log(`✅ Minimal test successful: ${gas.toString()}`);
      
    } catch (error) {
      console.error('❌ Even minimal test fails:');
      console.error('Error:', error.message);
      console.error('Error data:', error.data);
      
      // Decode the specific error
      if (error.data === '0x118cdaa70000000000000000000000000000000000000000000000000000000000000000') {
        console.error('\n🔍 DIAGNOSIS:');
        console.error('The error 0x118cdaa7 with zero address means:');
        console.error('- One of your factory contracts is trying to deploy an NFT contract');
        console.error('- The deployment is failing and returning address(0)');
        console.error('- This triggers AddressEmptyCode error in your EventSystemFactory');
        console.error('\n💡 LIKELY CAUSES:');
        console.error('1. NFT contract constructor is reverting due to invalid parameters');
        console.error('2. Factory contract does not have the NFT bytecode embedded');
        console.error('3. Out of gas during contract deployment');
        console.error('4. Missing dependencies in NFT contract imports');
      }
    }
    
    console.log('\n📋 Summary:');
    console.log('Next steps: Check your EventRegistrationNFT and EventCompletionNFT');
    console.log('constructor parameters and verify factory contracts have correct bytecode.');
    
  } catch (error) {
    console.error('❌ Deep analysis failed:', error);
  }
}

deepErrorAnalysis();