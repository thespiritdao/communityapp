/**
 * Quick verification: Does factory have pod registered?
 * This should PASS based on verify_pod_v2-52.js results
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

const FACTORY_ADDRESS = '0x3d453f1a4E200F446637DD9f4863DdcA9975eDCF';
const POD_ID = 'pod-1762310879258-3naytgade';
const EXPECTED_PROXY = '0x36237b3EeE30F08417C0EA0a84897c457669DDA0';

const FACTORY_ABI = [
  {
    inputs: [{ name: 'podId', type: 'string' }],
    name: 'getPodProxy',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
];

const client = createPublicClient({
  chain: base,
  transport: http()
});

async function verifyFactoryHasPod() {
  console.log('🔍 Verifying Factory Registration\n');
  console.log('Factory:', FACTORY_ADDRESS);
  console.log('Pod ID:', POD_ID);
  console.log('Expected Proxy:', EXPECTED_PROXY);
  console.log('---\n');

  try {
    const proxyAddress = await client.readContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'getPodProxy',
      args: [POD_ID]
    });

    console.log('✅ Factory Query Result:', proxyAddress);

    if (proxyAddress === '0x0000000000000000000000000000000000000000') {
      console.error('\n❌ PROBLEM FOUND: Factory has NO RECORD of this pod!');
      console.error('   This means the pod was either:');
      console.error('   1. Created with a different factory');
      console.error('   2. Never actually created on-chain');
      console.error('   3. Pod ID format is different than expected\n');
      return false;
    }

    if (proxyAddress.toLowerCase() === EXPECTED_PROXY.toLowerCase()) {
      console.log('\n✅ SUCCESS: Factory has correct proxy registered!');
      console.log('   This confirms the pod exists in factory storage.');
      console.log('   If transaction fails, the issue is pod_id being passed incorrectly.\n');
      return true;
    } else {
      console.warn('\n⚠️ WARNING: Proxy address mismatch!');
      console.warn(`   Factory has: ${proxyAddress}`);
      console.warn(`   Expected:    ${EXPECTED_PROXY}\n`);
      return false;
    }

  } catch (error) {
    console.error('❌ Error querying factory:', error.message);
    return false;
  }
}

verifyFactoryHasPod()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
