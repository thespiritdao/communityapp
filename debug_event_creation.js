const { ethers } = require('ethers');

// Your contract addresses from .env
const EVENT_SYSTEM_FACTORY = '0xd8f8AA9eD9B0D4BD93E02e7DDb7069B0a2155247';
const EVENT_REGISTRATION_FACTORY = '0xCCc63c2f9d572C9C2226A331a770a3f12E1C123A';
const EVENT_COMPLETION_FACTORY = '0x50D04158eBe1EcdD4c5FaB2315D97b8724772bBf';

// Test parameters (from your console log)
const testParams = {
    eventId: 'event-1753811823018-ciwc4ci9w',
    eventTitle: 'Test Event 1',
    eventDate: 1753812123,
    eventOrganizer: '0x12a0cf22D632c859B793F852af03b9d515580244',
    fundRecipient: '0x12a0cf22D632c859B793F852af03b9d515580244'
};

// Simple ABI for the functions we need
const eventSystemFactoryABI = [
    "function createFreeEventSystem(string eventId, string eventTitle, uint256 eventDate, address eventOrganizer, address fundRecipient) external returns (address, address)",
    "function createCompleteEventSystem(string eventId, string eventTitle, uint256 eventDate, address eventOrganizer, address fundRecipient, uint256 priceSystem, uint256 priceSelf) external returns (address, address)",
    "function getFactoryAddresses() external view returns (address, address, address)",
    "function owner() external view returns (address)"
];

const factoryABI = [
    "function createEventRegistrationSystem(string memory eventId, string memory eventTitle, uint256 eventDate, address eventOrganizer) external returns (address)",
    "function createEventCompletionSystem(string memory eventId, string memory eventTitle, uint256 eventDate, address eventOrganizer, address fundRecipient, uint256 priceSystem, uint256 priceSelf) external returns (address)",
    "function owner() external view returns (address)"
];

async function debugEventCreation() {
    console.log('🔍 Debug Event Creation Transaction');
    
    // Connect to Base mainnet (ethers v6 syntax)
    const provider = new ethers.JsonRpcProvider('https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50');
    
    try {
        // 1. Check EventSystemFactory
        console.log('\n1. 📋 Checking EventSystemFactory...');
        const systemFactory = new ethers.Contract(EVENT_SYSTEM_FACTORY, eventSystemFactoryABI, provider);
        
        const factoryAddresses = await systemFactory.getFactoryAddresses();
        console.log('✅ Factory addresses:', {
            registration: factoryAddresses[0],
            completion: factoryAddresses[1],
            escrow: factoryAddresses[2]
        });
        
        // 2. Check ownership of sub-factories
        console.log('\n2. 🔐 Checking factory ownership...');
        const regFactory = new ethers.Contract(EVENT_REGISTRATION_FACTORY, factoryABI, provider);
        const compFactory = new ethers.Contract(EVENT_COMPLETION_FACTORY, factoryABI, provider);
        
        const regOwner = await regFactory.owner();
        const compOwner = await compFactory.owner();
        
        console.log('✅ Registration Factory Owner:', regOwner);
        console.log('✅ Completion Factory Owner:', compOwner);
        console.log('✅ Expected Owner (System Factory):', EVENT_SYSTEM_FACTORY);
        
        if (regOwner.toLowerCase() !== EVENT_SYSTEM_FACTORY.toLowerCase()) {
            console.log('❌ ERROR: Registration factory not owned by system factory!');
        }
        if (compOwner.toLowerCase() !== EVENT_SYSTEM_FACTORY.toLowerCase()) {
            console.log('❌ ERROR: Completion factory not owned by system factory!');
        }
        
        // 3. Try to simulate the transaction
        console.log('\n3. 🧪 Simulating createFreeEventSystem call...');
        console.log('Parameters:', testParams);
        
        // Try to check what functions are available
        console.log('Available functions on contract:', Object.keys(systemFactory.interface.functions));
        
        try {
            const result = await systemFactory.createFreeEventSystem.staticCall(
                testParams.eventId,
                testParams.eventTitle,
                testParams.eventDate,
                testParams.eventOrganizer,
                testParams.fundRecipient
            );
            console.log('✅ Call simulation successful! Result:', result);
        } catch (error) {
            console.log('❌ Call simulation failed:');
            console.log('Error message:', error.message);
            console.log('Error reason:', error.reason);
            
            // Try with createCompleteEventSystem as fallback
            console.log('\n🔄 Trying createCompleteEventSystem instead...');
            try {
                const result2 = await systemFactory.createCompleteEventSystem.staticCall(
                    testParams.eventId,
                    testParams.eventTitle,
                    testParams.eventDate,
                    testParams.eventOrganizer,
                    testParams.fundRecipient,
                    1, // 1 wei SYSTEM
                    0  // 0 SELF
                );
                console.log('✅ createCompleteEventSystem simulation successful!', result2);
            } catch (error2) {
                console.log('❌ createCompleteEventSystem also failed:', error2.message);
            }
        }
        
    } catch (error) {
        console.log('❌ Setup error:', error.message);
    }
}

debugEventCreation();