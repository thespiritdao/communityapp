const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');

// NEW POD DETAILS (Test Pod V2-48)
const PROXY_ADDRESS = '0x391216f787f4daf267c8417d1ff607083bbd985d';
const MANAGEMENT_HAT_ID =
  '3666553570037151200077590861245132403912313958816401810360028524183552';
const POD_ID = 'pod-1762304205065-2zvttvdzh';
const YOUR_WALLET = '0x12a0cf22D632c859B793F852af03b9d515580244';
const HATS_CONTRACT = '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const FACTORY_ADDRESS = '0x3d453f1a4E200F446637DD9f4863DdcA9975eDCF';

const client = createPublicClient({
  chain: base,
  transport: http(
    'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50',
  ),
});

const proxyAbi = [
  {
    name: 'canManage',
    type: 'function',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'isActive',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'managementHatId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'membershipHatId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'podId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    name: 'factory',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'creator',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'isLeader',
    type: 'function',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
];

const factoryAbi = [
  {
    name: 'getPodProxy',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'canManageBounties',
    type: 'function',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'podId', type: 'string' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
];

const hatsAbi = [
  {
    name: 'isWearerOfHat',
    type: 'function',
    inputs: [
      { name: '_user', type: 'address' },
      { name: '_hatId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
];

async function verifyProxyFixed() {
  console.log('🔍 === VERIFYING PROXY FIX (Test Pod V2-48) ===\n');
  console.log('Pod ID:', POD_ID);
  console.log('Proxy Address:', PROXY_ADDRESS);
  console.log('Management HAT ID:', MANAGEMENT_HAT_ID);
  console.log('Your Wallet:', YOUR_WALLET);
  console.log();

  try {
    // Check proxy state
    console.log('📋 Checking Proxy State After Fix');
    console.log('===================================\n');

    const [
      proxyIsActive,
      proxyManagementHatId,
      proxyMembershipHatId,
      proxyPodId,
      proxyFactory,
      proxyCreator,
      isLeaderCheck,
    ] = await Promise.all([
      client.readContract({
        address: PROXY_ADDRESS,
        abi: proxyAbi,
        functionName: 'isActive',
      }),
      client.readContract({
        address: PROXY_ADDRESS,
        abi: proxyAbi,
        functionName: 'managementHatId',
      }),
      client.readContract({
        address: PROXY_ADDRESS,
        abi: proxyAbi,
        functionName: 'membershipHatId',
      }),
      client.readContract({
        address: PROXY_ADDRESS,
        abi: proxyAbi,
        functionName: 'podId',
      }),
      client.readContract({
        address: PROXY_ADDRESS,
        abi: proxyAbi,
        functionName: 'factory',
      }),
      client.readContract({
        address: PROXY_ADDRESS,
        abi: proxyAbi,
        functionName: 'creator',
      }),
      client.readContract({
        address: PROXY_ADDRESS,
        abi: proxyAbi,
        functionName: 'isLeader',
        args: [YOUR_WALLET],
      }),
    ]);

    console.log('Proxy State:');
    console.log('  isActive:', proxyIsActive ? '✅ true' : '❌ false');
    console.log('  managementHatId:', proxyManagementHatId.toString());
    console.log('  membershipHatId:', proxyMembershipHatId.toString());
    console.log('  podId:', proxyPodId);
    console.log('  factory:', proxyFactory);
    console.log('  creator:', proxyCreator);
    console.log(
      '  isLeader[YOUR_WALLET]:',
      isLeaderCheck ? '✅ true' : '❌ false',
    );
    console.log();

    // CRITICAL: Did the fix work?
    console.log('🎯 === PROXY FIX VERIFICATION ===\n');

    if (proxyManagementHatId.toString() === '0') {
      console.log('❌ PROXY FIX FAILED!');
      console.log('   managementHatId is still 0');
      console.log(
        '   The setHatIds transaction may have failed or not executed',
      );
      console.log();
      return;
    } else if (proxyManagementHatId.toString() === MANAGEMENT_HAT_ID) {
      console.log('✅ PROXY FIX SUCCESSFUL!');
      console.log('   managementHatId correctly set to:', MANAGEMENT_HAT_ID);
      console.log();
    } else {
      console.log('⚠️  UNEXPECTED VALUE!');
      console.log('   Expected:', MANAGEMENT_HAT_ID);
      console.log('   Actual:', proxyManagementHatId.toString());
      console.log();
    }

    // Check HAT ownership
    console.log('📋 Checking HAT Ownership');
    console.log('==========================\n');

    const wearsHat = await client.readContract({
      address: HATS_CONTRACT,
      abi: hatsAbi,
      functionName: 'isWearerOfHat',
      args: [YOUR_WALLET, BigInt(MANAGEMENT_HAT_ID)],
    });

    console.log('You wear Management HAT:', wearsHat ? '✅ true' : '❌ false');
    console.log();

    if (!wearsHat) {
      console.log('❌ PROBLEM: You do NOT wear the Management HAT!');
      console.log(
        '   This is unexpected - Phase 3 should have minted it to you.',
      );
      console.log();
      return;
    }

    // Check authorization
    console.log('📋 Checking Authorization (Direct Proxy Call)');
    console.log('==============================================\n');

    const canManageResult = await client.readContract({
      address: PROXY_ADDRESS,
      abi: proxyAbi,
      functionName: 'canManage',
      args: [YOUR_WALLET],
    });

    console.log(
      'proxy.canManage(YOUR_WALLET):',
      canManageResult ? '✅ true' : '❌ false',
    );
    console.log();

    if (!canManageResult) {
      console.log('❌ CRITICAL PROBLEM: proxy.canManage returns FALSE!');
      console.log();
      console.log('🔍 Debugging proxy.canManage() logic:');
      console.log('   1. isActive:', proxyIsActive ? 'true ✅' : 'false ❌');
      console.log(
        '   2. managementHatId != 0:',
        proxyManagementHatId.toString() !== '0' ? 'true ✅' : 'false ❌',
      );
      console.log('   3. You wear HAT:', wearsHat ? 'true ✅' : 'false ❌');
      console.log();
      console.log('   If all three are true, canManage should return true.');
      console.log('   There may be an issue with the proxy contract code.');
      console.log();
      return;
    }

    // Check factory authorization
    console.log('📋 Checking Factory Authorization');
    console.log('==================================\n');

    const factoryCanManage = await client.readContract({
      address: FACTORY_ADDRESS,
      abi: factoryAbi,
      functionName: 'canManageBounties',
      args: [YOUR_WALLET, POD_ID],
    });

    console.log(
      'factory.canManageBounties(YOUR_WALLET, POD_ID):',
      factoryCanManage ? '✅ true' : '❌ false',
    );
    console.log();

    if (!factoryCanManage) {
      console.log('❌ FACTORY AUTHORIZATION FAILS!');
      console.log();
      console.log('🔍 Debugging factory.canManageBounties():');
      console.log('   1. Factory calls: proxy.canManage(YOUR_WALLET)');
      console.log(
        '   2. Proxy returns:',
        canManageResult ? 'true ✅' : 'false ❌',
      );
      console.log(
        '   3. Factory should return:',
        canManageResult ? 'true ✅' : 'false ❌',
      );
      console.log();
      console.log(
        '   If proxy.canManage returns true but factory returns false,',
      );
      console.log('   there may be an issue with the factory contract.');
      console.log();
    }

    // SUMMARY
    console.log('\n📊 FINAL SUMMARY');
    console.log('================\n');
    console.log(
      proxyManagementHatId.toString() === MANAGEMENT_HAT_ID ? '✅' : '❌',
      'Management HAT ID set correctly',
    );
    console.log(wearsHat ? '✅' : '❌', 'You wear the Management HAT');
    console.log(canManageResult ? '✅' : '❌', 'proxy.canManage returns true');
    console.log(
      factoryCanManage ? '✅' : '❌',
      'factory.canManageBounties returns true',
    );
    console.log();

    if (
      proxyManagementHatId.toString() === MANAGEMENT_HAT_ID &&
      canManageResult &&
      factoryCanManage
    ) {
      console.log('🎉 ALL CHECKS PASSED!');
      console.log('===================\n');
      console.log('Proxy is fully configured and authorization is working!');
      console.log('Eligibility criteria sync should work now.');
    } else {
      console.log('🚨 ISSUES FOUND!');
      console.log('================\n');
      console.log('Some authorization checks are failing.');
      console.log('See details above for debugging information.');
    }
  } catch (error) {
    console.error('❌ Error during verification:', error.message);
    console.log();
    console.log('Stack trace:', error);
  }
}

verifyProxyFixed().catch(console.error);
