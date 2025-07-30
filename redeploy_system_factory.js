const { ethers } = require('ethers');

// Your configuration
const PROVIDER_URL = 'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50';
const PRIVATE_KEY = '43ba409097d6e533a98435b319e3052b5e827b98c163de221db2076555a9e97b';

// Current addresses
const EVENT_REGISTRATION_FACTORY = '0xA346d2086c4B34598f2A133C32f79330aC30565f';
const NEW_EVENT_COMPLETION_FACTORY = '0x52d652b40a9b763FD673D1e09ad267775F2786C5';
const EVENT_ESCROW = '0xA8b5b26281ea1DaA09AA0a78236271Cd4BeDD6Cc';
const YOUR_ADDRESS = '0x12a0cf22D632c859B793F852af03b9d515580244';

async function deployNewSystemFactory() {
  try {
    console.log('🔄 Preparing to deploy new EventSystemFactory...\n');
    
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log('📋 Deployment Configuration:');
    console.log(`Deployer: ${wallet.address}`);
    console.log(`Registration Factory: ${EVENT_REGISTRATION_FACTORY}`);
    console.log(`Completion Factory: ${NEW_EVENT_COMPLETION_FACTORY}`);
    console.log(`Event Escrow: ${EVENT_ESCROW}`);
    console.log(`Initial Owner: ${YOUR_ADDRESS}\n`);
    
    // You'll need the actual bytecode for EventSystemFactory here
    // This is just showing the constructor arguments needed
    console.log('Constructor arguments needed:');
    console.log(`_registrationFactory: ${EVENT_REGISTRATION_FACTORY}`);
    console.log(`_completionFactory: ${NEW_EVENT_COMPLETION_FACTORY}`);
    console.log(`_eventEscrow: ${EVENT_ESCROW}`);
    console.log(`initialOwner: ${YOUR_ADDRESS}\n`);
    
    console.log('❗ DEPLOYMENT NEEDED:');
    console.log('You need to deploy EventSystemFactory.sol with these constructor args:');
    console.log(`["${EVENT_REGISTRATION_FACTORY}", "${NEW_EVENT_COMPLETION_FACTORY}", "${EVENT_ESCROW}", "${YOUR_ADDRESS}"]`);
    console.log('\nOnce deployed, update your .env NEXT_PUBLIC_EVENT_SYSTEM_FACTORY with the new address.');
    console.log('Then update your Coinbase whitelist with the new EventSystemFactory address.');
    
  } catch (error) {
    console.error('❌ Deployment preparation failed:', error);
  }
}

deployNewSystemFactory();