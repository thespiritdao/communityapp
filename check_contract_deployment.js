const { ethers } = require('ethers');

const PROVIDER_URL = 'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50';
const EVENT_COMPLETION_FACTORY = '0xcD6a42782d230D7c13A74ddec5dD140e55499Df9';

async function checkContractDeployment() {
  try {
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    
    console.log('🔍 Checking EventCompletionFactory deployment...\n');
    
    // Check if contract exists
    const code = await provider.getCode(EVENT_COMPLETION_FACTORY);
    console.log(`Contract code length: ${code.length}`);
    console.log(`Has contract code: ${code !== '0x'}`);
    
    if (code === '0x') {
      console.log('❌ EventCompletionFactory is NOT deployed at this address!');
      console.log('This is why your transactions are failing.');
      console.log('\nYour EventSystemFactory is trying to call a non-existent contract.');
    } else {
      console.log('✅ EventCompletionFactory is deployed');
      console.log('Contract code preview:', code.substring(0, 100) + '...');
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  }
}

checkContractDeployment();