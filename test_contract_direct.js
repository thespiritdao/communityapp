// Direct contract test using viem (same as your app)
const { createPublicClient, http, createWalletClient, parseAbi } = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

// Contract details
const CONTRACT_ADDRESS = '0x4b76eF4DCBcF1249B58d024F81f941Ab4534540c';
const YOUR_WALLET = '0x12a0cf22D632c859B793F852af03b9d515580244';

// Minimal ABI for testing
const testABI = parseAbi([
  'function owner() view returns (address)',
  'function createFreeEventSystem(string eventId, string eventTitle, uint256 eventDate, address eventOrganizer, address fundRecipient) returns (address, address)'
]);

async function testContract() {
  try {
    console.log('=== DIRECT CONTRACT TEST ===');
    
    // Create public client
    const publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL)
    });

    console.log('✅ Public client created');

    // Check contract owner
    try {
      const owner = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: testABI,
        functionName: 'owner'
      });
      
      console.log('Contract Owner:', owner);
      console.log('Your Wallet:', YOUR_WALLET);
      console.log('Is Owner:', owner.toLowerCase() === YOUR_WALLET.toLowerCase());
      
      if (owner.toLowerCase() !== YOUR_WALLET.toLowerCase()) {
        console.log('❌ OWNERSHIP ISSUE: You are not the owner of this contract');
        return;
      }
    } catch (ownerError) {
      console.error('Error checking owner:', ownerError.message);
    }

    // Test the actual call with simulation
    const testParams = {
      eventId: 'test-event-direct',
      eventTitle: 'Direct Test Event',
      eventDate: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      eventOrganizer: YOUR_WALLET,
      fundRecipient: YOUR_WALLET
    };

    console.log('\\n=== SIMULATING CONTRACT CALL ===');
    console.log('Parameters:', testParams);

    try {
      const result = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi: testABI,
        functionName: 'createFreeEventSystem',
        args: [
          testParams.eventId,
          testParams.eventTitle,
          testParams.eventDate,
          testParams.eventOrganizer,
          testParams.fundRecipient
        ],
        account: YOUR_WALLET
      });
      
      console.log('✅ SIMULATION SUCCESS:', result);
      
    } catch (simError) {
      console.log('❌ SIMULATION FAILED:');
      console.log('Error name:', simError.name);
      console.log('Error message:', simError.message);
      
      // Try to extract the revert reason
      if (simError.data) {
        console.log('Error data:', simError.data);
      }
      
      if (simError.cause) {
        console.log('Error cause:', simError.cause);
      }
      
      // Check for specific contract errors
      if (simError.message.includes('onlyOwner')) {
        console.log('🔍 DIAGNOSIS: onlyOwner modifier failed - ownership issue');
      } else if (simError.message.includes('Event date must be in future')) {
        console.log('🔍 DIAGNOSIS: Timestamp validation failed');
      } else if (simError.message.includes('Event already exists')) {
        console.log('🔍 DIAGNOSIS: Event ID collision');
      } else {
        console.log('🔍 DIAGNOSIS: Unknown contract validation failure');
      }
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testContract();