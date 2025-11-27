const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');

// TEST POD V2-52 DETAILS (From errors.txt)
const POD_ID = 'pod-1762310879258-3naytgade';
const MANAGEMENT_HAT_ID = '3666553570037151583201476077717346993499070746393697715044809070084096';
const YOUR_WALLET = '0x12a0cf22D632c859B793F852af03b9d515580244';
const HATS_CONTRACT = '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const FACTORY_ADDRESS = '0x3d453f1a4E200F446637DD9f4863DdcA9975eDCF';

const client = createPublicClient({
  chain: base,
  transport: http('https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50')
});

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

const proxyAbi = [{
  name: 'canManage',
  type: 'function',
  inputs: [{ name: 'user', type: 'address' }],
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
  name: 'isActive',
  type: 'function',
  inputs: [],
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

async function verifyPod() {
  console.log('🔍 === VERIFYING TEST POD V2-52 ===\n');
  console.log('Pod ID:', POD_ID);
  console.log('Expected Management HAT ID:', MANAGEMENT_HAT_ID);
  console.log('Your Wallet:', YOUR_WALLET);
  console.log();

  try {
    // Step 1: Get proxy address from factory
    console.log('📋 Step 1: Looking up proxy address from factory...');
    const proxyAddress = await client.readContract({
      address: FACTORY_ADDRESS,
      abi: factoryAbi,
      functionName: 'getPodProxy',
      args: [POD_ID]
    });

    console.log('  Proxy Address:', proxyAddress);

    if (proxyAddress === '0x0000000000000000000000000000000000000000') {
      console.log('❌ CRITICAL ERROR: Proxy not found in factory!');
      console.log('   This pod was not registered properly.');
      return;
    }
    console.log('  ✅ Proxy found in factory\n');

    // Step 2: Check proxy state
    console.log('📋 Step 2: Checking proxy on-chain state...');
    const [
      proxyIsActive,
      proxyManagementHatId,
      proxyMembershipHatId
    ] = await Promise.all([
      client.readContract({
        address: proxyAddress,
        abi: proxyAbi,
        functionName: 'isActive'
      }),
      client.readContract({
        address: proxyAddress,
        abi: proxyAbi,
        functionName: 'managementHatId'
      }),
      client.readContract({
        address: proxyAddress,
        abi: proxyAbi,
        functionName: 'membershipHatId'
      })
    ]);

    console.log('  isActive:', proxyIsActive ? '✅ true' : '❌ false');
    console.log('  managementHatId:', proxyManagementHatId.toString());
    console.log('  membershipHatId:', proxyMembershipHatId.toString());
    console.log();

    // Step 3: THE CRITICAL CHECK - Did Phase 3.5 work?
    console.log('🎯 === CRITICAL CHECK: DID PHASE 3.5 WORK? ===\n');

    if (proxyManagementHatId.toString() === '0') {
      console.log('❌ PHASE 3.5 FAILED!');
      console.log('   managementHatId is still 0');
      console.log('   This is why authorization is failing!');
      console.log();
      console.log('🔧 SOLUTION:');
      console.log('   Run Phase 3.5 manually using ProxyHatIdFixer component');
      console.log('   OR call factory.setHatIdsViaFactory() manually');
      console.log();
      return;
    }

    if (proxyManagementHatId.toString() === MANAGEMENT_HAT_ID) {
      console.log('✅ PHASE 3.5 SUCCESSFUL!');
      console.log('   managementHatId correctly set to:', MANAGEMENT_HAT_ID);
      console.log();
    } else {
      console.log('⚠️  UNEXPECTED VALUE!');
      console.log('   Expected:', MANAGEMENT_HAT_ID);
      console.log('   Actual:', proxyManagementHatId.toString());
      console.log();
    }

    // Step 4: Check if you wear the HAT
    console.log('📋 Step 4: Checking HAT ownership...');
    const wearsHat = await client.readContract({
      address: HATS_CONTRACT,
      abi: hatsAbi,
      functionName: 'isWearerOfHat',
      args: [YOUR_WALLET, BigInt(MANAGEMENT_HAT_ID)]
    });

    console.log('  You wear Management HAT:', wearsHat ? '✅ true' : '❌ false');
    console.log();

    if (!wearsHat) {
      console.log('❌ PROBLEM: You do NOT wear the Management HAT!');
      console.log('   This could mean:');
      console.log('   1. Phase 3 (Mint HATs) failed or was skipped');
      console.log('   2. HAT was transferred to someone else');
      console.log('   3. HAT ID mismatch between database and blockchain');
      console.log();
      return;
    }

    // Step 5: Check proxy.canManage()
    console.log('📋 Step 5: Checking proxy.canManage()...');
    const canManageResult = await client.readContract({
      address: proxyAddress,
      abi: proxyAbi,
      functionName: 'canManage',
      args: [YOUR_WALLET]
    });

    console.log('  proxy.canManage(YOUR_WALLET):', canManageResult ? '✅ true' : '❌ false');
    console.log();

    if (!canManageResult) {
      console.log('❌ CRITICAL PROBLEM: proxy.canManage returns FALSE!');
      console.log();
      console.log('🔍 Debugging proxy.canManage() logic:');
      console.log('   1. isActive:', proxyIsActive ? 'true ✅' : 'false ❌');
      console.log('   2. managementHatId != 0:', proxyManagementHatId.toString() !== '0' ? 'true ✅' : 'false ❌');
      console.log('   3. You wear HAT:', wearsHat ? 'true ✅' : 'false ❌');
      console.log();
      console.log('   If all three are true, canManage should return true.');
      console.log('   There may be an issue with the proxy contract code.');
      console.log();
      return;
    }

    // Step 6: Check factory.canManageBounties()
    console.log('📋 Step 6: Checking factory.canManageBounties()...');
    const factoryCanManage = await client.readContract({
      address: FACTORY_ADDRESS,
      abi: factoryAbi,
      functionName: 'canManageBounties',
      args: [YOUR_WALLET, POD_ID]
    });

    console.log('  factory.canManageBounties(YOUR_WALLET, POD_ID):', factoryCanManage ? '✅ true' : '❌ false');
    console.log();

    if (!factoryCanManage) {
      console.log('❌ FACTORY AUTHORIZATION FAILS!');
      console.log();
      console.log('🔍 This is the error you\'re seeing!');
      console.log('   The factory cannot authorize you to manage eligibility criteria.');
      console.log();
    }

    // FINAL SUMMARY
    console.log('\n📊 FINAL SUMMARY');
    console.log('================\n');
    console.log(proxyManagementHatId.toString() === MANAGEMENT_HAT_ID ? '✅' : '❌', 'Management HAT ID set correctly');
    console.log(wearsHat ? '✅' : '❌', 'You wear the Management HAT');
    console.log(canManageResult ? '✅' : '❌', 'proxy.canManage returns true');
    console.log(factoryCanManage ? '✅' : '❌', 'factory.canManageBounties returns true');
    console.log();

    if (proxyManagementHatId.toString() === MANAGEMENT_HAT_ID && canManageResult && factoryCanManage) {
      console.log('🎉 ALL CHECKS PASSED!');
      console.log('===================\n');
      console.log('Eligibility criteria sync should work now.');
      console.log('If it still fails, clear browser cache and try again.');
    } else {
      console.log('🚨 ISSUES FOUND!');
      console.log('================\n');
      console.log('Authorization is failing on-chain.');
      console.log('See details above for what needs to be fixed.');
    }

  } catch (error) {
    console.error('❌ Error during verification:', error.message);
    console.log();
    console.log('Stack trace:', error);
  }
}

verifyPod().catch(console.error);
