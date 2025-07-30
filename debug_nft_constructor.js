const { ethers } = require('ethers');

const PROVIDER_URL = 'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50';
const EVENT_REGISTRATION_FACTORY = '0x328c1e26737DBcFd055ccEEc7E99FF51854DfC30';
const EVENT_COMPLETION_FACTORY = '0x35A322B96c584dc3D68bbEE103d0B347Aa86b383';

async function debugNFTConstructor() {
  try {
    console.log('🔍 Debugging NFT Constructor Issues...\n');
    
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    
    console.log('📋 Test Parameters Analysis:');
    const eventId = 'test-debug-' + Date.now();
    const eventTitle = 'Test Event Debug';
    const eventDate = Math.floor(Date.now() / 1000) + 300;
    const eventOrganizer = '0x12a0cf22D632c859B793F852af03b9d515580244';
    
    console.log(`Event ID: "${eventId}" (length: ${eventId.length})`);
    console.log(`Event Title: "${eventTitle}" (length: ${eventTitle.length})`);
    console.log(`Event Date: ${eventDate} (${new Date(eventDate * 1000)})`);
    console.log(`Event Organizer: ${eventOrganizer}`);
    
    // What the factory generates
    const tokenName = eventTitle + " Registration";
    const tokenSymbol = "EVENTREG";
    
    console.log(`Generated Token Name: "${tokenName}" (length: ${tokenName.length})`);
    console.log(`Generated Token Symbol: "${tokenSymbol}" (length: ${tokenSymbol.length})\n`);
    
    // Check for potential constructor issues
    console.log('🔍 Potential Constructor Issues:');
    
    // 1. Empty string check
    if (eventId === '') console.log('❌ Empty event ID');
    if (eventTitle === '') console.log('❌ Empty event title');
    if (tokenName === '') console.log('❌ Empty token name');
    if (tokenSymbol === '') console.log('❌ Empty token symbol');
    
    // 2. Very long strings that might cause issues
    if (tokenName.length > 100) console.log('⚠️ Token name very long');
    if (tokenSymbol.length > 20) console.log('⚠️ Token symbol very long');
    
    // 3. Special characters that might break string concatenation
    console.log(`Token name has special chars: ${!/^[a-zA-Z0-9\s]+$/.test(tokenName)}`);
    console.log(`Event title has special chars: ${!/^[a-zA-Z0-9\s]+$/.test(eventTitle)}`);
    
    // 4. Zero address check
    if (eventOrganizer === '0x0000000000000000000000000000000000000000') {
      console.log('❌ Zero address for event organizer');
    }
    
    console.log('\n📋 Testing Individual Factory Calls...');
    
    // Test EventRegistrationFactory directly
    console.log('\n🧪 EventRegistrationFactory Test:');
    try {
      const regABI = [
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
      
      const regFactory = new ethers.Contract(EVENT_REGISTRATION_FACTORY, regABI, provider);
      
      // Try to estimate gas - this will reveal the exact error
      const regGas = await regFactory.createEventRegistrationSystem.estimateGas(
        eventId, eventTitle, eventDate, eventOrganizer
      );
      
      console.log(`✅ Registration Factory gas: ${regGas.toString()}`);
      
    } catch (error) {
      console.error('❌ Registration Factory failed:');
      console.error('Error:', error.message);
      if (error.data) {
        console.error('Error data:', error.data);
        
        // Decode the error
        if (error.data === '0x118cdaa70000000000000000000000000000000000000000000000000000000000000000') {
          console.error('🔍 AddressEmptyCode with zero address');
          console.error('This means the NFT contract deployment failed');
        }
      }
    }
    
    // Test EventCompletionFactory
    console.log('\n🧪 EventCompletionFactory Test:');
    try {
      const compABI = [
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
      
      const compFactory = new ethers.Contract(EVENT_COMPLETION_FACTORY, compABI, provider);
      
      const compGas = await compFactory.createEventCompletionSystem.estimateGas(
        eventId, eventTitle, eventDate, eventOrganizer, eventOrganizer, 0, 0
      );
      
      console.log(`✅ Completion Factory gas: ${compGas.toString()}`);
      
    } catch (error) {
      console.error('❌ Completion Factory failed:');
      console.error('Error:', error.message);
      if (error.data) {
        console.error('Error data:', error.data);
      }
    }
    
    // Test OpenZeppelin compatibility
    console.log('\n📋 Checking OpenZeppelin Compatibility...');
    
    // The issue might be with Ownable constructor in newer OpenZeppelin versions
    console.log('💡 POSSIBLE ROOT CAUSES:');
    console.log('1. OpenZeppelin Ownable(initialOwner) - newer versions require non-zero owner');
    console.log('2. ERC721(name, symbol) - empty strings might cause revert');
    console.log('3. String concatenation in abi.encodePacked might fail');
    console.log('4. Gas limit exceeded during NFT contract deployment'); 
    console.log('5. Missing contract bytecode in factory deployment');
    
    console.log('\n🔧 DEBUGGING NEXT STEPS:');
    console.log('1. Check if your NFT contracts compile correctly');
    console.log('2. Verify OpenZeppelin version compatibility');
    console.log('3. Test direct NFT deployment with exact same parameters');
    console.log('4. Check if factory contracts have embedded NFT bytecode');
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugNFTConstructor();