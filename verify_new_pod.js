const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');

// NEW POD DETAILS (from pod creation test)
const PROXY_ADDRESS = '0x391216f787f4daf267c8417d1ff607083bbd985d';
const MANAGEMENT_HAT_ID = '3666553570037151200077590861245132403912313958816401810360028524183552';
const POD_ID = 'pod-1762304205065-2zvttvdzh';
const YOUR_WALLET = '0x12a0cf22D632c859B793F852af03b9d515580244';
const HATS_CONTRACT = '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const FACTORY_ADDRESS = '0x3d453f1a4E200F446637DD9f4863DdcA9975eDCF';

const client = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50')
});

const proxyAbi = [{
  name: 'canManage',
  type: 'function',
  inputs: [{ name: 'user', type: 'address' }],
  outputs: [{ name: '', type: 'bool' }],
  stateMutability: 'view'
}, {
  name: 'isActive',
  type: 'function',
  inputs: [],
  outputs: [{ name: '', type: 'bool' }],
  stateMutability: 'view'
}, {
  name: 'managementHatId',
  type: 'function',
  inputs: [],
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'view'
}, {
  name: 'membershipHatId',
  type: 'function',
  inputs: [],
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'view'
}, {
  name: 'podId',
  type: 'function',
  inputs: [],
  outputs: [{ name: '', type: 'string' }],
  stateMutability: 'view'
}, {
  name: 'factory',
  type: 'function',
  inputs: [],
  outputs: [{ name: '', type: 'address' }],
  stateMutability: 'view'
}];

const factoryAbi = [{
  name: 'getPodProxy',
  type: 'function',
  inputs: [{ name: 'podId', type: 'string' }],
  outputs: [{ name: '', type: 'address' }],
  stateMutability: 'view'
}, {
  name: 'canManageBounties',
  type: 'function',
  inputs: [
    { name: 'user', type: 'address' },
    { name: 'podId', type: 'string' }
  ],
  outputs: [{ name: '', type: 'bool' }],
  stateMutability: 'view'
}];

const hatsAbi = [{
  name: 'isWearerOfHat',
  type: 'function',
  inputs: [
    { name: '_user', type: 'address' },
    { name: '_hatId', type: 'uint256' }
  ],
  outputs: [{ name: '', type: 'bool' }],
  stateMutability: 'view'
}];

async function verifyNewPod() {
  console.log('🔍 === VERIFYING NEW POD (Phase 3.5 Test) ===\n');
  console.log('Pod ID:', POD_ID);
  console.log('Proxy Address:', PROXY_ADDRESS);
  console.log('Management HAT ID:', MANAGEMENT_HAT_ID);
  console.log('Your Wallet:', YOUR_WALLET);
  console.log();

  try {
    // ========================================
    // STEP 1: Check Factory Registration
    // ========================================
    console.log('📋 STEP 1: Checking Factory Registration');
    console.log('==========================================\n');

    const factoryProxyAddress = await client.readContract({
      address: FACTORY_ADDRESS,
      abi: factoryAbi,
      functionName: 'getPodProxy',
      args: [POD_ID]
    });

    console.log('Factory getPodProxy result:', factoryProxyAddress);
    console.log('Expected proxy address:', PROXY_ADDRESS);
    console.log('Match:', factoryProxyAddress.toLowerCase() === PROXY_ADDRESS.toLowerCase() ? '✅ YES' : '❌ NO');
    console.log();

    if (factoryProxyAddress === '0x0000000000000000000000000000000000000000') {
      console.log('❌ PROBLEM: Pod is NOT registered in factory!');
      return;
    }

    // ========================================
    // STEP 2: Check Proxy State
    // ========================================
    console.log('📋 STEP 2: Checking Proxy State');
    console.log('================================\n');

    const [proxyIsActive, proxyManagementHatId, proxyMembershipHatId, proxyPodId, proxyFactory] = await Promise.all([
      client.readContract({
        address: PROXY_ADDRESS,
        abi: proxyAbi,
        functionName: 'isActive'
      }),
      client.readContract({
        address: PROXY_ADDRESS,
        abi: proxyAbi,
        functionName: 'managementHatId'
      }),
      client.readContract({
        address: PROXY_ADDRESS,
        abi: proxyAbi,
        functionName: 'membershipHatId'
      }),
      client.readContract({
        address: PROXY_ADDRESS,
        abi: proxyAbi,
        functionName: 'podId'
      }),
      client.readContract({
        address: PROXY_ADDRESS,
        abi: proxyAbi,
        functionName: 'factory'
      })
    ]);

    console.log('Proxy State:');
    console.log('  isActive:', proxyIsActive ? '✅ true' : '❌ false');
    console.log('  managementHatId:', proxyManagementHatId.toString());
    console.log('  membershipHatId:', proxyMembershipHatId.toString());
    console.log('  podId:', proxyPodId);
    console.log('  factory:', proxyFactory);
    console.log();

    // ========================================
    // CRITICAL CHECK: Phase 3.5 Success?
    // ========================================
    console.log('🎯 === PHASE 3.5 VERIFICATION ===\n');

    if (proxyManagementHatId.toString() === '0') {
      console.log('❌ PHASE 3.5 FAILED TO SET MANAGEMENT HAT ID!');
      console.log('   Expected:', MANAGEMENT_HAT_ID);
      console.log('   Actual:', proxyManagementHatId.toString());
      console.log();
      console.log('📝 This means:');
      console.log('   - Phase 3.5 transaction was rejected or failed');
      console.log('   - Proxy not configured for HAT-based authorization');
      console.log('   - You need to use ProxyHatIdFixer component');
      console.log();
    } else if (proxyManagementHatId.toString() === MANAGEMENT_HAT_ID) {
      console.log('✅ PHASE 3.5 SUCCESS!');
      console.log('   Management HAT ID correctly set on proxy!');
      console.log('   Value:', MANAGEMENT_HAT_ID);
      console.log();
    } else {
      console.log('⚠️  UNEXPECTED: Management HAT ID is set but doesn\'t match!');
      console.log('   Expected:', MANAGEMENT_HAT_ID);
      console.log('   Actual:', proxyManagementHatId.toString());
      console.log();
    }

    // ========================================
    // STEP 3: Check HAT Ownership
    // ========================================
    console.log('📋 STEP 3: Checking HAT Ownership');
    console.log('==================================\n');

    const wearsHat = await client.readContract({
      address: HATS_CONTRACT,
      abi: hatsAbi,
      functionName: 'isWearerOfHat',
      args: [YOUR_WALLET, BigInt(MANAGEMENT_HAT_ID)]
    });

    console.log('Hats.isWearerOfHat(YOUR_WALLET, MANAGEMENT_HAT):', wearsHat ? '✅ true' : '❌ false');
    console.log();

    if (!wearsHat) {
      console.log('❌ PROBLEM: You do NOT wear the Management HAT!');
      console.log('   This is unexpected - Phase 3 should have minted it to you.');
      return;
    }

    // ========================================
    // STEP 4: Check Authorization
    // ========================================
    console.log('📋 STEP 4: Checking Authorization');
    console.log('==================================\n');

    const canManageResult = await client.readContract({
      address: PROXY_ADDRESS,
      abi: proxyAbi,
      functionName: 'canManage',
      args: [YOUR_WALLET]
    });

    console.log('proxy.canManage(YOUR_WALLET):', canManageResult ? '✅ true' : '❌ false');
    console.log();

    if (!canManageResult) {
      console.log('❌ PROBLEM: Authorization check fails!');
      console.log('   This confirms Phase 3.5 did not complete successfully.');
      console.log();
    }

    const factoryCanManage = await client.readContract({
      address: FACTORY_ADDRESS,
      abi: factoryAbi,
      functionName: 'canManageBounties',
      args: [YOUR_WALLET, POD_ID]
    });

    console.log('factory.canManageBounties(YOUR_WALLET, POD_ID):', factoryCanManage ? '✅ true' : '❌ false');
    console.log();

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n📊 SUMMARY');
    console.log('==========\n');
    console.log(factoryProxyAddress !== '0x0000000000000000000000000000000000000000' ? '✅' : '❌', 'Pod registered in factory');
    console.log(proxyIsActive ? '✅' : '❌', 'Proxy is active');
    console.log(proxyManagementHatId.toString() === MANAGEMENT_HAT_ID ? '✅' : '❌', 'Management HAT ID set correctly (Phase 3.5)');
    console.log(wearsHat ? '✅' : '❌', 'You wear the Management HAT');
    console.log(canManageResult ? '✅' : '❌', 'proxy.canManage returns true');
    console.log(factoryCanManage ? '✅' : '❌', 'factory.canManageBounties returns true');
    console.log();

    if (proxyManagementHatId.toString() === '0') {
      console.log('🎯 ACTION REQUIRED:');
      console.log('==================\n');
      console.log('Phase 3.5 did not complete - you need to manually set HAT IDs on proxy.');
      console.log();
      console.log('Use ProxyHatIdFixer component:');
      console.log('1. Update PROXY_ADDRESS to:', PROXY_ADDRESS);
      console.log('2. Update MANAGEMENT_HAT_ID to:', MANAGEMENT_HAT_ID);
      console.log('3. Add component to pod management page');
      console.log('4. Click "Fix Proxy Configuration"');
      console.log('5. Run this script again to verify');
    } else {
      console.log('🎉 ALL CHECKS PASSED!');
      console.log('===================\n');
      console.log('Pod is fully configured and ready to use!');
      console.log('Try setting eligibility criteria - it should work!');
    }

  } catch (error) {
    console.error('❌ Error during verification:', error.message);
    console.log();
    console.log('Stack trace:', error);
  }
}

verifyNewPod().catch(console.error);
