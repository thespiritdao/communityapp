const { ethers } = require('ethers');

const PROVIDER_URL = 'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50';

const contracts = {
  'EventSystemFactory': '0x4b76eF4DCBcF1249B58d024F81f941Ab4534540c',
  'EventEscrow': '0xA8b5b26281ea1DaA09AA0a78236271Cd4BeDD6Cc',
  'EventRegistrationFactory': '0xA346d2086c4B34598f2A133C32f79330aC30565f',
  'EventCompletionFactory': '0xcD6a42782d230D7c13A74ddec5dD140e55499Df9'
};

async function checkAllContracts() {
  try {
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    
    console.log('🔍 Checking all contract deployments...\n');
    
    for (const [name, address] of Object.entries(contracts)) {
      const code = await provider.getCode(address);
      const deployed = code !== '0x';
      const status = deployed ? '✅' : '❌';
      
      console.log(`${status} ${name}: ${address}`);
      console.log(`   Deployed: ${deployed}`);
      console.log(`   Code length: ${code.length}\n`);
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  }
}

checkAllContracts();