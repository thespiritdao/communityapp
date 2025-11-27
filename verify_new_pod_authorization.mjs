/**
 * Verify if user wears management HAT for new pod
 * This checks what the V3 factory authorization check sees
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// New Pod Details from errors.txt
const POD_ID = 'pod-1762396565099-u8p11nxtp';
const MANAGEMENT_HAT_ID =
  '3666553570037151774763418685953454288292449140182345667387199343034368';
const USER_ADDRESS = '0x12a0cf22D632c859B793F852af03b9d515580244';
const PROXY_ADDRESS = '0x008470bebf3e607eb342324387f14d1c2231404a';
const FACTORY_ADDRESS = '0x52122e732700568760e475FA8289a13A4568d886';
const HATS_PROTOCOL = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';

const client = createPublicClient({
  chain: base,
  transport: http(),
});

console.log('🔍 Verifying Authorization for New Pod\n');
console.log('Pod ID:', POD_ID);
console.log('Management HAT ID:', MANAGEMENT_HAT_ID);
console.log('User:', USER_ADDRESS);
console.log('Proxy:', PROXY_ADDRESS);
console.log('---\n');

async function verify() {
  try {
    // Step 1: Check if factory has this pod registered
    console.log('📋 Step 1: Checking factory registration...');
    const proxyFromFactory = await client.readContract({
      address: FACTORY_ADDRESS,
      abi: [
        {
          name: 'getPodProxy',
          type: 'function',
          inputs: [{ name: 'podId', type: 'string' }],
          outputs: [{ name: '', type: 'address' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'getPodProxy',
      args: [POD_ID],
    });

    console.log('  Factory has proxy:', proxyFromFactory);

    if (proxyFromFactory === '0x0000000000000000000000000000000000000000') {
      console.error('  ❌ Factory does NOT have this pod registered!');
      return false;
    }

    if (proxyFromFactory.toLowerCase() !== PROXY_ADDRESS.toLowerCase()) {
      console.error('  ❌ Proxy mismatch!');
      console.error('    Expected:', PROXY_ADDRESS);
      console.error('    Factory has:', proxyFromFactory);
      return false;
    }

    console.log('  ✅ Factory has correct proxy registered\n');

    // Step 2: Check proxy's managementHatId
    console.log('📋 Step 2: Checking proxy managementHatId...');
    const proxyManagementHatId = await client.readContract({
      address: PROXY_ADDRESS,
      abi: [
        {
          name: 'managementHatId',
          type: 'function',
          inputs: [],
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'managementHatId',
    });

    console.log('  Proxy managementHatId:', proxyManagementHatId.toString());

    if (proxyManagementHatId.toString() !== MANAGEMENT_HAT_ID) {
      console.error('  ❌ Management HAT ID mismatch!');
      console.error('    Expected:', MANAGEMENT_HAT_ID);
      console.error('    Proxy has:', proxyManagementHatId.toString());
      return false;
    }

    console.log('  ✅ Proxy has correct managementHatId\n');

    // Step 3: THE CRITICAL CHECK - Does user wear the HAT?
    console.log('📋 Step 3: Checking if user wears management HAT...');
    console.log('  This is the EXACT check the V3 factory does:\n');
    console.log('  IHats(HATS_PROTOCOL).isWearerOfHat(');
    console.log('    user:', USER_ADDRESS);
    console.log('    hatId:', MANAGEMENT_HAT_ID);
    console.log('  )\n');

    const wearsHat = await client.readContract({
      address: HATS_PROTOCOL,
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
      args: [USER_ADDRESS, BigInt(MANAGEMENT_HAT_ID)],
    });

    console.log(
      '  Result:',
      wearsHat
        ? '✅ TRUE - User wears HAT'
        : '❌ FALSE - User does NOT wear HAT',
    );
    console.log();

    if (!wearsHat) {
      console.error('🚨 PROBLEM FOUND!\n');
      console.error(
        'The user does NOT wear the management HAT according to Hats Protocol.',
      );
      console.error('This is why the V3 factory authorization check fails.\n');
      console.error('Possible causes:');
      console.error('1. Phase 3 (mint HATs) failed or minted to wrong address');
      console.error('2. HAT was transferred or revoked');
      console.error('3. HAT is not active');
      console.error('4. Wrong HAT ID was stored in database\n');

      // Additional diagnostics
      console.log('🔍 Additional Diagnostics:\n');

      // Check HAT status
      try {
        const hatStatus = await client.readContract({
          address: HATS_PROTOCOL,
          abi: [
            {
              name: 'isActive',
              type: 'function',
              inputs: [{ name: '_hatId', type: 'uint256' }],
              outputs: [{ name: '', type: 'bool' }],
              stateMutability: 'view',
            },
          ],
          functionName: 'isActive',
          args: [BigInt(MANAGEMENT_HAT_ID)],
        });
        console.log('  HAT is active:', hatStatus ? '✅ Yes' : '❌ No');
      } catch (e) {
        console.log('  Could not check HAT active status');
      }

      // Check balance
      try {
        const balance = await client.readContract({
          address: HATS_PROTOCOL,
          abi: [
            {
              name: 'balanceOf',
              type: 'function',
              inputs: [
                { name: '_user', type: 'address' },
                { name: '_hatId', type: 'uint256' },
              ],
              outputs: [{ name: '', type: 'uint256' }],
              stateMutability: 'view',
            },
          ],
          functionName: 'balanceOf',
          args: [USER_ADDRESS, BigInt(MANAGEMENT_HAT_ID)],
        });
        console.log(
          '  HAT balance:',
          balance.toString(),
          balance > 0 ? '✅' : '❌',
        );
      } catch (e) {
        console.log('  Could not check HAT balance');
      }

      return false;
    }

    console.log('✅ SUCCESS: All authorization checks pass!');
    console.log('   User should be able to sync eligibility criteria.\n');
    console.log(
      '   If still failing, the issue is elsewhere (not authorization).',
    );

    return true;
  } catch (error) {
    console.error('❌ Error during verification:', error.message);
    return false;
  }
}

verify()
  .then((success) => process.exit(success ? 0 : 1))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
