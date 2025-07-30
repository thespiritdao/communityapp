const { ethers } = require('ethers');

const PROVIDER_URL = 'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50';
const PRIVATE_KEY = '43ba409097d6e533a98435b319e3052b5e827b98c163de221db2076555a9e97b';

const EVENT_SYSTEM_FACTORY = '0x03432e12E9C6e3D0566727E7768C42f98dDF29d7';
const EVENT_REGISTRATION_FACTORY = '0xA346d2086c4B34598f2A133C32f79330aC30565f';
const EVENT_COMPLETION_FACTORY = '0x52d652b40a9b763FD673D1e09ad267775F2786C5';

async function transferFactoryOwnership() {
  try {
    console.log('🔄 Transferring Factory Ownership to EventSystemFactory...\n');
    
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    const ownershipABI = [
      {
        "inputs": [{"internalType": "address", "name": "newOwner", "type": "address"}],
        "name": "transferOwnership",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
      }
    ];
    
    console.log(`From: ${wallet.address}`);
    console.log(`To: ${EVENT_SYSTEM_FACTORY}\n`);
    
    // Transfer EventRegistrationFactory ownership
    console.log('📋 Transferring EventRegistrationFactory ownership...');
    const regFactory = new ethers.Contract(EVENT_REGISTRATION_FACTORY, ownershipABI, wallet);
    
    try {
      const regTx = await regFactory.transferOwnership(EVENT_SYSTEM_FACTORY);
      console.log(`✅ Registration Factory transfer tx: ${regTx.hash}`);
      
      const regReceipt = await regTx.wait();
      console.log(`✅ Registration Factory transfer confirmed in block ${regReceipt.blockNumber}\n`);
    } catch (error) {
      console.error('❌ Registration Factory transfer failed:', error.message);
    }
    
    // Transfer EventCompletionFactory ownership
    console.log('📋 Transferring EventCompletionFactory ownership...');
    const compFactory = new ethers.Contract(EVENT_COMPLETION_FACTORY, ownershipABI, wallet);
    
    try {
      const compTx = await compFactory.transferOwnership(EVENT_SYSTEM_FACTORY);
      console.log(`✅ Completion Factory transfer tx: ${compTx.hash}`);
      
      const compReceipt = await compTx.wait();
      console.log(`✅ Completion Factory transfer confirmed in block ${compReceipt.blockNumber}\n`);
    } catch (error) {
      console.error('❌ Completion Factory transfer failed:', error.message);
    }
    
    console.log('🎉 Ownership transfers complete!');
    console.log('Now EventSystemFactory can call both factories.');
    console.log('Your event creation should work now!');
    
  } catch (error) {
    console.error('❌ Transfer failed:', error);
  }
}

transferFactoryOwnership();