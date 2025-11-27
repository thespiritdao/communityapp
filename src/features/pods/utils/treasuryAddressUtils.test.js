// Quick test script to verify factory integration
// Run this in browser console on pod detail page to test

async function testTreasuryAddressUtils() {
  console.log('🧪 Testing Treasury Address Utils...');

  const podId = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';
  const databaseAddress = '0xf896e01b3fab321778caac2aae771f5b5b08620c';

  try {
    // Import the utility (this will work in the browser context)
    const { getTreasuryAddress, hasTreasuryDeployed, getTreasuryAddressSync } =
      await import('./treasuryAddressUtils');

    console.log('📋 Test Configuration:');
    console.log('Pod ID:', podId);
    console.log('Database Address:', databaseAddress);
    console.log();

    // Test 1: Sync method
    console.log('🔍 Test 1: Sync Treasury Address');
    const syncResult = getTreasuryAddressSync(databaseAddress);
    console.log('Sync Result:', syncResult);
    console.log();

    // Test 2: Factory lookup
    console.log('🔍 Test 2: Factory Treasury Lookup');
    const factoryResult = await getTreasuryAddress(podId, databaseAddress);
    console.log('Factory Result:', factoryResult);
    console.log();

    // Test 3: Treasury deployment check
    console.log('🔍 Test 3: Treasury Deployment Check');
    const hasDeployed = await hasTreasuryDeployed(podId, databaseAddress);
    console.log('Has Treasury Deployed:', hasDeployed);
    console.log();

    // Summary
    console.log('✅ Test Summary:');
    console.log('- Sync Address:', syncResult);
    console.log('- Factory Address:', factoryResult);
    console.log('- Addresses Match:', syncResult === factoryResult);
    console.log('- Treasury Deployed:', hasDeployed);

    if (factoryResult && factoryResult !== databaseAddress) {
      console.log('⚠️  MISMATCH DETECTED:');
      console.log('  Database has:', databaseAddress);
      console.log('  Factory has:', factoryResult);
      console.log('  👉 Update database to use factory address');
    } else {
      console.log('✅ Addresses are consistent');
    }

    return {
      syncAddress: syncResult,
      factoryAddress: factoryResult,
      hasDeployed,
      addressesMatch: syncResult === factoryResult,
    };
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Auto-run if in browser
if (typeof window !== 'undefined') {
  console.log('🚀 Treasury Address Utils Test Available');
  console.log('Run: testTreasuryAddressUtils()');
  window.testTreasuryAddressUtils = testTreasuryAddressUtils;
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testTreasuryAddressUtils };
}
