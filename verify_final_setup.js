const { ethers } = require('ethers');

const PROVIDER_URL = 'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50';

// New addresses from .env
const EVENT_SYSTEM_FACTORY = '0x2Ea78a5Fe7360e5B702Bc84FA36Db15B028DD601';
const EVENT_REGISTRATION_FACTORY = '0x328c1e26737DBcFd055ccEEc7E99FF51854DfC30';
const EVENT_COMPLETION_FACTORY = '0x35A322B96c584dc3D68bbEE103d0B347Aa86b383';

async function verifyFinalSetup() {
  try {
    console.log('🔍 Final Setup Verification...\n');
    
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    
    // Check all contracts are deployed
    console.log('📋 Contract Deployment Status:');
    const systemCode = await provider.getCode(EVENT_SYSTEM_FACTORY);
    const regCode = await provider.getCode(EVENT_REGISTRATION_FACTORY);
    const compCode = await provider.getCode(EVENT_COMPLETION_FACTORY);
    
    console.log(`✅ EventSystemFactory: ${systemCode !== '0x'} (${EVENT_SYSTEM_FACTORY})`);
    console.log(`✅ EventRegistrationFactory: ${regCode !== '0x'} (${EVENT_REGISTRATION_FACTORY})`);
    console.log(`✅ EventCompletionFactory: ${compCode !== '0x'} (${EVENT_COMPLETION_FACTORY})\n`);
    
    // Check EventSystemFactory configuration
    console.log('📋 EventSystemFactory Configuration:');
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
    
    const systemFactory = new ethers.Contract(EVENT_SYSTEM_FACTORY, factoryABI, provider);
    const [regFactory, compFactory, escrow] = await systemFactory.getFactoryAddresses();
    
    console.log(`Registration Factory: ${regFactory}`);
    console.log(`Expected: ${EVENT_REGISTRATION_FACTORY}`);
    console.log(`✅ Match: ${regFactory === EVENT_REGISTRATION_FACTORY}`);
    
    console.log(`Completion Factory: ${compFactory}`);
    console.log(`Expected: ${EVENT_COMPLETION_FACTORY}`);
    console.log(`✅ Match: ${compFactory === EVENT_COMPLETION_FACTORY}`);
    
    console.log(`Escrow: ${escrow}\n`);
    
    // Check ownership
    console.log('📋 Ownership Verification:');
    const ownerABI = [
      {
        "inputs": [],
        "name": "owner",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
      }
    ];
    
    const regFactoryContract = new ethers.Contract(EVENT_REGISTRATION_FACTORY, ownerABI, provider);
    const compFactoryContract = new ethers.Contract(EVENT_COMPLETION_FACTORY, ownerABI, provider);
    
    const regOwner = await regFactoryContract.owner();
    const compOwner = await compFactoryContract.owner();
    
    console.log(`Registration Factory Owner: ${regOwner}`);
    console.log(`Completion Factory Owner: ${compOwner}`);
    console.log(`EventSystemFactory: ${EVENT_SYSTEM_FACTORY}`);
    console.log(`✅ SystemFactory owns RegFactory: ${regOwner === EVENT_SYSTEM_FACTORY}`);
    console.log(`✅ SystemFactory owns CompFactory: ${compOwner === EVENT_SYSTEM_FACTORY}\n`);
    
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
      const testFactory = new ethers.Contract(EVENT_SYSTEM_FACTORY, testABI, provider);
      
      const eventId = 'final-test-' + Date.now();
      const eventTitle = 'Final Test Event';
      const eventDate = Math.floor(Date.now() / 1000) + 300;
      const eventOrganizer = '0x12a0cf22D632c859B793F852af03b9d515580244';
      const fundRecipient = '0x12a0cf22D632c859B793F852af03b9d515580244';
      
      const estimatedGas = await testFactory.createFreeEventSystem.estimateGas(
        eventId, eventTitle, eventDate, eventOrganizer, fundRecipient
      );
      
      console.log(`🎉 SUCCESS! Gas estimate: ${estimatedGas.toString()}`);
      console.log('✅ Your event creation should work now!\n');
      
    } catch (error) {
      console.error('❌ Transaction simulation failed:', error.message);
      if (error.data) {
        console.error('Error data:', error.data);
      }
    }
    
    console.log('📋 Next Steps:');
    console.log('1. ✅ Update Coinbase whitelist with new EventSystemFactory address');
    console.log('2. ✅ Test event creation in your app');
    console.log('3. ✅ Test event registration');
    console.log('4. ✅ Test completion NFT minting');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

verifyFinalSetup();