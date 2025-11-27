/**
 * Comprehensive Proxy Admin HAT Diagnostics
 *
 * This script checks:
 * 1. Does the proxy have getHatStatus() function?
 * 2. Was the admin HAT actually minted to the proxy?
 * 3. What does getHatStatus() return?
 * 4. What does Hats Protocol say?
 * 5. Is the factory using the new template?
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import * as dotenv from 'dotenv';

dotenv.config();

const HATS_PROTOCOL = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_POD_AUTH_FACTORY;
const TEMPLATE_ADDRESS = process.env.NEXT_PUBLIC_POD_AUTH_PROXY;

// Minimal proxy detection
const MINIMAL_PROXY_ABI = [
  {
    name: 'implementation',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view'
  }
];

const PROXY_ABI = [
  {
    name: 'getHatStatus',
    type: 'function',
    inputs: [{ name: '_hatId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  {
    name: 'proxyAdminHatId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'isActive',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  {
    name: 'factory',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view'
  },
  {
    name: 'podId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view'
  }
];

const FACTORY_ABI = [
  {
    name: 'podAuthTemplate',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view'
  }
];

const HATS_ABI = [
  {
    name: 'isWearerOfHat',
    type: 'function',
    inputs: [
      { name: '_user', type: 'address' },
      { name: '_hatId', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view'
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      { name: 'wearer', type: 'address' },
      { name: 'hatId', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'viewHat',
    type: 'function',
    inputs: [{ name: '_hatId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'details', type: 'string' },
        { name: 'maxSupply', type: 'uint32' },
        { name: 'supply', type: 'uint32' },
        { name: 'eligibility', type: 'address' },
        { name: 'toggle', type: 'address' },
        { name: 'imageURI', type: 'string' },
        { name: 'numChildren', type: 'uint16' },
        { name: 'mutable', type: 'bool' },
        { name: 'active', type: 'bool' }
      ]
    }],
    stateMutability: 'view'
  }
];

const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL)
});

async function diagnoseProxyAdminHat(proxyAddress) {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 COMPREHENSIVE PROXY ADMIN HAT DIAGNOSTICS');
  console.log('='.repeat(80));
  console.log('\n📋 Configuration:');
  console.log('  Proxy Address:', proxyAddress);
  console.log('  Factory Address:', FACTORY_ADDRESS);
  console.log('  Template Address:', TEMPLATE_ADDRESS);
  console.log('  Hats Protocol:', HATS_PROTOCOL);
  console.log('\n' + '='.repeat(80));

  try {
    // Step 1: Get proxy basic info
    console.log('\n1️⃣  CHECKING PROXY BASIC INFO');
    console.log('-'.repeat(80));

    const podId = await client.readContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: 'podId'
    });
    console.log('  ✅ Pod ID:', podId);

    const proxyFactory = await client.readContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: 'factory'
    });
    console.log('  ✅ Proxy\'s factory:', proxyFactory);

    if (proxyFactory.toLowerCase() !== FACTORY_ADDRESS.toLowerCase()) {
      console.log('  ⚠️  WARNING: Proxy was created by different factory!');
      console.log('      Expected:', FACTORY_ADDRESS);
      console.log('      Actual:', proxyFactory);
    }

    const isActive = await client.readContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: 'isActive'
    });
    console.log('  ✅ Is Active:', isActive);

    const adminHatId = await client.readContract({
      address: proxyAddress,
      abi: PROXY_ABI,
      functionName: 'proxyAdminHatId'
    });
    console.log('  ✅ Admin HAT ID:', adminHatId.toString());

    if (adminHatId === 0n) {
      console.log('  ❌ CRITICAL: Admin HAT ID is 0! Phase 5 may have failed!');
      return false;
    }

    // Step 2: Check if factory is using correct template
    console.log('\n2️⃣  CHECKING FACTORY TEMPLATE');
    console.log('-'.repeat(80));

    const factoryTemplate = await client.readContract({
      address: FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      functionName: 'podAuthTemplate'
    });
    console.log('  Factory\'s template:', factoryTemplate);
    console.log('  .env template:', TEMPLATE_ADDRESS);

    if (factoryTemplate.toLowerCase() !== TEMPLATE_ADDRESS.toLowerCase()) {
      console.log('  ❌ MISMATCH! Factory is NOT using the template from .env!');
      console.log('      This means the factory wasn\'t updated after template deployment.');
      console.log('      You need to call: factory.updatePodAuthTemplate(' + TEMPLATE_ADDRESS + ')');
      return false;
    } else {
      console.log('  ✅ Factory template matches .env');
    }

    // Step 3: Check if template has getHatStatus function
    console.log('\n3️⃣  CHECKING TEMPLATE FOR getHatStatus() FUNCTION');
    console.log('-'.repeat(80));

    const templateCode = await client.getBytecode({ address: TEMPLATE_ADDRESS });
    console.log('  Template bytecode length:', templateCode?.length || 0, 'characters');

    if (!templateCode || templateCode.length < 100) {
      console.log('  ❌ CRITICAL: Template has no bytecode! Not deployed correctly!');
      return false;
    }

    // Try calling getHatStatus on the template directly
    try {
      // Use a dummy HAT ID to test
      const testHatId = 1n;
      const templateStatus = await client.readContract({
        address: TEMPLATE_ADDRESS,
        abi: PROXY_ABI,
        functionName: 'getHatStatus',
        args: [testHatId]
      });
      console.log('  ✅ Template has getHatStatus() function! (returned:', templateStatus, ')');
    } catch (error) {
      console.log('  ❌ CRITICAL: Template does NOT have getHatStatus() function!');
      console.log('      Error:', error.message);
      console.log('      You deployed the OLD template without the IHatsToggle fix!');
      return false;
    }

    // Step 4: Check if proxy (via delegatecall) has getHatStatus
    console.log('\n4️⃣  CHECKING PROXY\'S getHatStatus() FUNCTION');
    console.log('-'.repeat(80));

    try {
      const proxyHatStatus = await client.readContract({
        address: proxyAddress,
        abi: PROXY_ABI,
        functionName: 'getHatStatus',
        args: [adminHatId]
      });
      console.log('  ✅ Proxy has getHatStatus() function!');
      console.log('  ✅ getHatStatus(adminHatId) returned:', proxyHatStatus);

      if (!proxyHatStatus && isActive) {
        console.log('  ⚠️  WARNING: getHatStatus returned false but pod is active!');
        console.log('      This is unexpected - check the implementation logic.');
      }
    } catch (error) {
      console.log('  ❌ CRITICAL: Proxy does NOT have getHatStatus() function!');
      console.log('      Error:', error.message);
      console.log('      This proxy was created with the OLD template!');
      return false;
    }

    // Step 5: Check HAT details from Hats Protocol
    console.log('\n5️⃣  CHECKING ADMIN HAT DETAILS FROM HATS PROTOCOL');
    console.log('-'.repeat(80));

    try {
      const hatDetails = await client.readContract({
        address: HATS_PROTOCOL,
        abi: HATS_ABI,
        functionName: 'viewHat',
        args: [adminHatId]
      });

      console.log('  HAT Details:');
      console.log('    - Supply:', hatDetails.supply.toString(), '/', hatDetails.maxSupply.toString());
      console.log('    - Eligibility:', hatDetails.eligibility);
      console.log('    - Toggle:', hatDetails.toggle);
      console.log('    - Active:', hatDetails.active);
      console.log('    - Mutable:', hatDetails.mutable);

      if (hatDetails.toggle.toLowerCase() !== proxyAddress.toLowerCase()) {
        console.log('  ⚠️  WARNING: HAT toggle is NOT the proxy!');
        console.log('      Expected:', proxyAddress);
        console.log('      Actual:', hatDetails.toggle);
      } else {
        console.log('  ✅ HAT toggle is correctly set to proxy');
      }

      if (!hatDetails.active) {
        console.log('  ⚠️  WARNING: HAT is marked as inactive by Hats Protocol!');
      }

      if (hatDetails.supply === 0) {
        console.log('  ❌ CRITICAL: HAT has supply of 0! It was never minted!');
        console.log('      Phase 5 of pod creation FAILED!');
        return false;
      }
    } catch (error) {
      console.log('  ❌ Error getting HAT details:', error.message);
    }

    // Step 6: Check if proxy owns the HAT (balance check)
    console.log('\n6️⃣  CHECKING IF PROXY OWNS THE ADMIN HAT (BALANCE)');
    console.log('-'.repeat(80));

    try {
      const balance = await client.readContract({
        address: HATS_PROTOCOL,
        abi: HATS_ABI,
        functionName: 'balanceOf',
        args: [proxyAddress, adminHatId]
      });
      console.log('  Proxy\'s HAT balance:', balance.toString());

      if (balance === 0n) {
        console.log('  ❌ CRITICAL: Proxy balance is 0! HAT was not minted to proxy!');
        console.log('      Phase 5 of pod creation FAILED!');
        return false;
      } else {
        console.log('  ✅ Proxy has been minted the admin HAT!');
      }
    } catch (error) {
      console.log('  ❌ Error checking balance:', error.message);
    }

    // Step 7: Check isWearerOfHat (the final test)
    console.log('\n7️⃣  FINAL TEST: isWearerOfHat()');
    console.log('-'.repeat(80));

    try {
      const isWearer = await client.readContract({
        address: HATS_PROTOCOL,
        abi: HATS_ABI,
        functionName: 'isWearerOfHat',
        args: [proxyAddress, adminHatId]
      });

      console.log('  isWearerOfHat(proxy, adminHatId):', isWearer);

      if (!isWearer) {
        console.log('  ❌ CRITICAL: Hats Protocol says proxy does NOT wear admin HAT!');
        console.log('      This is the exact error you\'re seeing.');
        console.log('\n  Possible causes:');
        console.log('      1. HAT toggle (proxy) returned false from getHatStatus()');
        console.log('      2. HAT was not minted to proxy');
        console.log('      3. HAT was minted but then revoked/burned');
        console.log('      4. Toggle is not set correctly');
        return false;
      } else {
        console.log('  ✅ SUCCESS! Hats Protocol recognizes proxy as admin HAT wearer!');
      }
    } catch (error) {
      console.log('  ❌ Error checking isWearerOfHat:', error.message);
      return false;
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ ALL DIAGNOSTICS PASSED!');
    console.log('='.repeat(80) + '\n');

    return true;

  } catch (error) {
    console.error('\n❌ DIAGNOSTIC ERROR:', error.message);
    console.error(error);
    return false;
  }
}

// Get proxy address from command line
const proxyAddress = process.argv[2] || '0x15ac11b2d8c2f238663ec9ddb1c8b43e537c6890'; // From error log

if (!proxyAddress) {
  console.error('\n❌ Usage: node diagnose_proxy_admin_hat.js <PROXY_ADDRESS>');
  console.error('Example: node diagnose_proxy_admin_hat.js 0x123...\n');
  process.exit(1);
}

diagnoseProxyAdminHat(proxyAddress)
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
