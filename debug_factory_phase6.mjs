import { createPublicClient, http, getContract } from 'viem';
import { base } from 'viem/chains';
import * as dotenv from 'dotenv';
dotenv.config();

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_POD_AUTH_FACTORY;
const POD_ID = 'pod-1762223119102-pzqe1ul0u'; // From your logs
const PROXY_ADDRESS = '0x2eec24d04c774fdd60ba926ffe746c68c8cb0d19'; // From your logs
const USER_ADDRESS = '0xYOUR_ADDRESS_HERE'; // Replace with your wallet address

const publicClient = createPublicClient({
  chain: base,
  transport: http()
});

console.log('🔍 PHASE 6 FACTORY DIAGNOSTICS\n');
console.log('Factory Address:', FACTORY_ADDRESS);
console.log('Pod ID:', POD_ID);
console.log('Proxy Address:', PROXY_ADDRESS);
console.log('User Address:', USER_ADDRESS);
console.log('\n' + '='.repeat(60) + '\n');

// Test 1: Check if factory has the proxy registered
console.log('TEST 1: Factory Proxy Lookup');
try {
  const registeredProxy = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: [{
      name: 'podProxies',
      type: 'function',
      inputs: [{ name: '', type: 'string' }],
      outputs: [{ name: '', type: 'address' }],
      stateMutability: 'view'
    }],
    functionName: 'podProxies',
    args: [POD_ID]
  });

  console.log('✅ Factory lookup result:', registeredProxy);
  console.log('   Expected proxy:', PROXY_ADDRESS);
  console.log('   Match:', registeredProxy.toLowerCase() === PROXY_ADDRESS.toLowerCase() ? '✅ YES' : '❌ NO');

  if (registeredProxy === '0x0000000000000000000000000000000000000000') {
    console.log('❌ CRITICAL: Factory does not have this pod registered!');
    console.log('   This means the pod was not created by this factory.');
  }
} catch (error) {
  console.log('❌ FAILED:', error.message);
  console.log('   This means the factory contract does not have podProxies mapping or is not deployed.');
}

console.log('\n' + '='.repeat(60) + '\n');

// Test 2: Check if user can manage the proxy
console.log('TEST 2: User Authorization Check');
try {
  const canManage = await publicClient.readContract({
    address: PROXY_ADDRESS,
    abi: [{
      name: 'canManage',
      type: 'function',
      inputs: [{ name: 'user', type: 'address' }],
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'view'
    }],
    functionName: 'canManage',
    args: [USER_ADDRESS]
  });

  console.log('   Can user manage proxy:', canManage ? '✅ YES' : '❌ NO');

  if (!canManage) {
    console.log('❌ CRITICAL: User is not authorized to manage this proxy!');
    console.log('   This means the user is not in the leaders array.');
  }
} catch (error) {
  console.log('❌ FAILED:', error.message);
}

console.log('\n' + '='.repeat(60) + '\n');

// Test 3: Check proxy's stored factory address
console.log('TEST 3: Proxy Factory Address Check');
try {
  const proxyFactory = await publicClient.readContract({
    address: PROXY_ADDRESS,
    abi: [{
      name: 'factory',
      type: 'function',
      inputs: [],
      outputs: [{ name: '', type: 'address' }],
      stateMutability: 'view'
    }],
    functionName: 'factory'
  });

  console.log('   Proxy stored factory:', proxyFactory);
  console.log('   Current factory:', FACTORY_ADDRESS);
  console.log('   Match:', proxyFactory.toLowerCase() === FACTORY_ADDRESS.toLowerCase() ? '✅ YES' : '❌ NO');

  if (proxyFactory.toLowerCase() !== FACTORY_ADDRESS.toLowerCase()) {
    console.log('❌ CRITICAL: Factory address mismatch!');
    console.log('   Proxy was created by a different factory.');
  }
} catch (error) {
  console.log('❌ FAILED:', error.message);
}

console.log('\n' + '='.repeat(60) + '\n');

// Test 4: Try to simulate the setProxyAdminHatViaFactory call
console.log('TEST 4: Simulate setProxyAdminHatViaFactory Call');
const ADMIN_HAT_ID = 3666553570005765212495800936835685219812829642264270152281732669243392n;
try {
  // This will fail if the function doesn't exist or if simulation fails
  await publicClient.simulateContract({
    address: FACTORY_ADDRESS,
    abi: [{
      name: 'setProxyAdminHatViaFactory',
      type: 'function',
      inputs: [
        { name: 'podId', type: 'string' },
        { name: 'proxyAdminHatId', type: 'uint256' }
      ],
      outputs: [],
      stateMutability: 'nonpayable'
    }],
    functionName: 'setProxyAdminHatViaFactory',
    args: [POD_ID, ADMIN_HAT_ID],
    account: USER_ADDRESS
  });

  console.log('✅ Simulation successful! The call should work.');
} catch (error) {
  console.log('❌ SIMULATION FAILED:', error.message);
  console.log('\n   Possible causes:');
  console.log('   1. Function does not exist on deployed factory');
  console.log('   2. User is not authorized');
  console.log('   3. Pod proxy does not exist in factory mapping');
  console.log('   4. Proxy authorization check failing');
}

console.log('\n' + '='.repeat(60) + '\n');
console.log('SUMMARY:');
console.log('If all tests pass except simulation, the issue is likely:');
console.log('  - Factory contract not deployed with setProxyAdminHatViaFactory function');
console.log('  - Need to redeploy factory OR use direct proxy call');
