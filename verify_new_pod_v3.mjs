/**
 * Verify new pod using V3 factory function names
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const POD_ID = 'pod-1762396565099-u8p11nxtp';
const FACTORY_ADDRESS = '0x52122e732700568760e475FA8289a13A4568d886';

const client = createPublicClient({
  chain: base,
  transport: http(),
});

console.log('🔍 Checking if pod exists in V3 factory\n');
console.log('Pod ID:', POD_ID);
console.log('Factory:', FACTORY_ADDRESS);
console.log('---\n');

try {
  // V3 uses getProxyAddress instead of getPodProxy
  const proxyAddress = await client.readContract({
    address: FACTORY_ADDRESS,
    abi: [
      {
        name: 'getProxyAddress',
        type: 'function',
        inputs: [{ name: 'podId', type: 'string' }],
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
      },
    ],
    functionName: 'getProxyAddress',
    args: [POD_ID],
  });

  console.log('Proxy Address:', proxyAddress);

  if (proxyAddress === '0x0000000000000000000000000000000000000000') {
    console.error('\n❌ CRITICAL: Pod NOT registered in factory!');
    console.error('   This means createPodProxy transaction either:');
    console.error('   1. Failed silently');
    console.error("   2. Hasn't been executed yet");
    console.error('   3. Used wrong factory address\n');
    process.exit(1);
  } else {
    console.log('\n✅ Pod IS registered in factory');
    console.log('   Proxy address:', proxyAddress);
    console.log('\n   This means the authorization issue is elsewhere.');
    console.log('   Proceeding to check HAT ownership...\n');
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
