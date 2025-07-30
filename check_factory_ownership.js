const { ethers } = require('ethers');

const PROVIDER_URL = 'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50';
const EVENT_SYSTEM_FACTORY = '0x03432e12E9C6e3D0566727E7768C42f98dDF29d7';
const EVENT_REGISTRATION_FACTORY = '0xA346d2086c4B34598f2A133C32f79330aC30565f';
const EVENT_COMPLETION_FACTORY = '0x52d652b40a9b763FD673D1e09ad267775F2786C5';
const YOUR_ADDRESS = '0x12a0cf22D632c859B793F852af03b9d515580244';

async function checkFactoryOwnership() {
  try {
    console.log('🔍 Checking Factory Contract Ownership...\n');
    
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
    
    // Check EventSystemFactory ownership
    console.log('📋 EventSystemFactory Ownership:');
    const systemFactory = new ethers.Contract(EVENT_SYSTEM_FACTORY, ownerABI, provider);
    const systemOwner = await systemFactory.owner();
    console.log(`Owner: ${systemOwner}`);
    console.log(`Your Address: ${YOUR_ADDRESS}`);
    console.log(`✅ You own SystemFactory: ${systemOwner === YOUR_ADDRESS}\n`);
    
    // Check EventRegistrationFactory ownership
    console.log('📋 EventRegistrationFactory Ownership:');
    const regFactory = new ethers.Contract(EVENT_REGISTRATION_FACTORY, ownerABI, provider);
    const regOwner = await regFactory.owner();
    console.log(`Owner: ${regOwner}`);
    console.log(`Your Address: ${YOUR_ADDRESS}`);
    console.log(`EventSystemFactory: ${EVENT_SYSTEM_FACTORY}`);
    console.log(`✅ You own RegFactory: ${regOwner === YOUR_ADDRESS}`);
    console.log(`✅ SystemFactory owns RegFactory: ${regOwner === EVENT_SYSTEM_FACTORY}`);
    
    if (regOwner !== EVENT_SYSTEM_FACTORY && regOwner !== YOUR_ADDRESS) {
      console.log('❌ CRITICAL ISSUE: Wrong owner for EventRegistrationFactory!');
      console.log('EventRegistrationFactory must be owned by EventSystemFactory or you.');
    }
    
    // Check EventCompletionFactory ownership  
    console.log('\n📋 EventCompletionFactory Ownership:');
    const compFactory = new ethers.Contract(EVENT_COMPLETION_FACTORY, ownerABI, provider);
    const compOwner = await compFactory.owner();
    console.log(`Owner: ${compOwner}`);
    console.log(`Your Address: ${YOUR_ADDRESS}`);
    console.log(`EventSystemFactory: ${EVENT_SYSTEM_FACTORY}`);
    console.log(`✅ You own CompFactory: ${compOwner === YOUR_ADDRESS}`);
    console.log(`✅ SystemFactory owns CompFactory: ${compOwner === EVENT_SYSTEM_FACTORY}`);
    
    if (compOwner !== EVENT_SYSTEM_FACTORY && compOwner !== YOUR_ADDRESS) {
      console.log('❌ CRITICAL ISSUE: Wrong owner for EventCompletionFactory!');
      console.log('EventCompletionFactory must be owned by EventSystemFactory or you.');
    }
    
    console.log('\n🔍 DIAGNOSIS:');
    console.log('The issue is likely:');
    
    if (regOwner === YOUR_ADDRESS && compOwner === YOUR_ADDRESS) {
      console.log('✅ Ownership is correct - you own both factories');
      console.log('❌ But EventSystemFactory cannot call factories because it does not own them');
      console.log('');
      console.log('💡 SOLUTION: Transfer ownership of both factories to EventSystemFactory');
      console.log(`Run: regFactory.transferOwnership("${EVENT_SYSTEM_FACTORY}")`);
      console.log(`Run: compFactory.transferOwnership("${EVENT_SYSTEM_FACTORY}")`);
    } else if (regOwner === EVENT_SYSTEM_FACTORY && compOwner === EVENT_SYSTEM_FACTORY) {
      console.log('✅ Ownership is correct - EventSystemFactory owns both factories');
      console.log('❌ Issue must be in the NFT contract deployment itself');
      console.log('Check NFT constructor parameters and bytecode');
    } else {
      console.log('❌ Mixed ownership - need to fix this first');
    }
    
  } catch (error) {
    console.error('❌ Ownership check failed:', error);
  }
}

checkFactoryOwnership();