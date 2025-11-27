const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');

// CONFIGURATION
const HATS_CONTRACT = '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const FACTORY_ADDRESS = '0x3d453f1a4E200F446637DD9f4863DdcA9975eDCF'; // From error logs
const PROXY_ADDRESS = '0x15bb499ca19046b48ea4b2b2c4b026d4fe0b926a'; // From database
const POD_ID = 'pod-1762293352803-qgg7ydx6c'; // blockchain_pod_id from database
const YOUR_WALLET = '0x12a0cf22D632c859B793F852af03b9d515580244';
const MANAGEMENT_HAT_ID =
  '3666553570037151104296619557127078756515624761922077834188833387708416';

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

async function debugProxyState() {
  console.log('🔍 === DEBUGGING PROXY & FACTORY STATE ===\n');
  console.log('Factory Address:', FACTORY_ADDRESS);
  console.log('Proxy Address:', PROXY_ADDRESS);
  console.log('Pod ID:', POD_ID);
  console.log('Your Wallet:', YOUR_WALLET);
  console.log('Management HAT ID:', MANAGEMENT_HAT_ID);
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
      args: [POD_ID],
    });

    console.log('Factory getPodProxy result:', factoryProxyAddress);
    console.log('Expected proxy address:', PROXY_ADDRESS);
    console.log(
      'Match:',
      factoryProxyAddress.toLowerCase() === PROXY_ADDRESS.toLowerCase()
        ? '✅ YES'
        : '❌ NO',
    );
    console.log();

    if (factoryProxyAddress === '0x0000000000000000000000000000000000000000') {
      console.log('❌ PROBLEM: Pod is NOT registered in factory!');
      console.log('   This explains why authorization fails.');
      console.log("   The factory can't find your pod by ID.");
      return;
    }

    // ========================================
    // STEP 2: Check Proxy State
    // ========================================
    console.log('📋 STEP 2: Checking Proxy State');
    console.log('================================\n');

    const [proxyIsActive, proxyManagementHatId, proxyPodId, proxyFactory] =
      await Promise.all([
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
          functionName: 'podId',
        }),
        client.readContract({
          address: PROXY_ADDRESS,
          abi: proxyAbi,
          functionName: 'factory',
        }),
      ]);

    console.log('Proxy State:');
    console.log('  isActive:', proxyIsActive ? '✅ true' : '❌ false');
    console.log('  managementHatId:', proxyManagementHatId.toString());
    console.log('  podId:', proxyPodId);
    console.log('  factory:', proxyFactory);
    console.log();

    if (!proxyIsActive) {
      console.log('❌ PROBLEM: Proxy is NOT active!');
      console.log(
        '   canManage will always return false when isActive = false',
      );
      return;
    }

    if (proxyManagementHatId.toString() !== MANAGEMENT_HAT_ID) {
      console.log('❌ PROBLEM: Management HAT ID mismatch!');
      console.log('   Proxy has:', proxyManagementHatId.toString());
      console.log('   Expected:', MANAGEMENT_HAT_ID);
      return;
    }

    // ========================================
    // STEP 3: Direct canManage Check
    // ========================================
    console.log('📋 STEP 3: Direct canManage Check on Proxy');
    console.log('===========================================\n');

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
      console.log('❌ PROBLEM: Proxy.canManage returns FALSE for your wallet!');
      console.log('   Even though you wear the HAT, something is wrong.');
      console.log();
      console.log('🔍 Debugging checks:');
      console.log('   1. Proxy isActive:', proxyIsActive ? 'YES' : 'NO');
      console.log(
        '   2. Management HAT ID set:',
        proxyManagementHatId.toString() !== '0' ? 'YES' : 'NO',
      );
      console.log('   3. You wear HAT: (checking on Hats contract...)');

      // Double-check HAT ownership
      const wearsHat = await client.readContract({
        address: HATS_CONTRACT,
        abi: [
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
        ],
        functionName: 'isWearerOfHat',
        args: [YOUR_WALLET, BigInt(MANAGEMENT_HAT_ID)],
      });

      console.log('   4. Hats.isWearerOfHat:', wearsHat ? 'YES' : 'NO');
      console.log();

      if (wearsHat) {
        console.log(
          '⚠️  MYSTERY: You wear the HAT but canManage returns false!',
        );
        console.log(
          '    This suggests a bug in the proxy contract or Hats protocol integration.',
        );
      } else {
        console.log('❌ You do NOT wear the HAT according to Hats contract!');
        console.log(
          '   This contradicts our earlier check. Something is very wrong.',
        );
      }
      return;
    }

    // ========================================
    // STEP 4: Factory Authorization Check
    // ========================================
    console.log('📋 STEP 4: Factory Authorization Check');
    console.log('=======================================\n');

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
      console.log('❌ PROBLEM: Factory authorization check fails!');
      console.log('   But proxy.canManage returns true...');
      console.log(
        '   This suggests the factory is checking the wrong proxy or pod.',
      );
    } else {
      console.log('✅ Factory authorization check passes!');
      console.log();
      console.log(
        '🤔 MYSTERY: Factory says you CAN manage, but transaction fails?',
      );
      console.log('   Possible causes:');
      console.log('   1. Gas estimation issue (unlikely)');
      console.log('   2. Different factory address being called');
      console.log('   3. Transaction parameters incorrect');
    }

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n📊 SUMMARY');
    console.log('==========\n');
    console.log(
      '✅ Pod registered in factory:',
      factoryProxyAddress !== '0x0000000000000000000000000000000000000000',
    );
    console.log(proxyIsActive ? '✅' : '❌', 'Proxy is active:', proxyIsActive);
    console.log(
      proxyManagementHatId.toString() === MANAGEMENT_HAT_ID ? '✅' : '❌',
      'Management HAT ID correct',
    );
    console.log(canManageResult ? '✅' : '❌', 'proxy.canManage returns true');
    console.log(
      factoryCanManage ? '✅' : '❌',
      'factory.canManageBounties returns true',
    );
  } catch (error) {
    console.error('❌ Error during debug:', error.message);
    console.log();
    console.log('Stack trace:', error);
  }
}

debugProxyState().catch(console.error);
