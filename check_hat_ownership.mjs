/**
 * Check if user wears the management HAT
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const MANAGEMENT_HAT_ID =
  '3666553570037151774763418685953454288292449140182345667387199343034368';
const USER_ADDRESS = '0x12a0cf22D632c859B793F852af03b9d515580244';
const PROXY_ADDRESS = '0x008470bebf3e607eb342324387f14d1c2231404a';
const HATS_PROTOCOL = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';

const client = createPublicClient({
  chain: base,
  transport: http(),
});

console.log('🎩 Checking HAT Ownership\n');
console.log('Management HAT ID:', MANAGEMENT_HAT_ID);
console.log('User:', USER_ADDRESS);
console.log('---\n');

async function check() {
  try {
    // Check proxy managementHatId
    console.log('1. Checking proxy managementHatId...');
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

    console.log('   Proxy managementHatId:', proxyManagementHatId.toString());
    console.log('   Expected:', MANAGEMENT_HAT_ID);
    console.log(
      '   Match:',
      proxyManagementHatId.toString() === MANAGEMENT_HAT_ID ? '✅' : '❌',
    );
    console.log();

    // THE CRITICAL CHECK
    console.log('2. Checking if user wears management HAT...');
    console.log('   Calling: IHats.isWearerOfHat(user, hatId)');

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

    console.log('   Result:', wearsHat ? '✅ TRUE' : '❌ FALSE');
    console.log();

    if (!wearsHat) {
      console.error('🚨 USER DOES NOT WEAR THE HAT!\n');
      console.error('This is why authorization fails.\n');

      // Check balance
      console.log('3. Checking HAT balance...');
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
      console.log('   HAT balance:', balance.toString());
      console.log();

      // Check if HAT is active
      console.log('4. Checking if HAT is active...');
      const isActive = await client.readContract({
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
      console.log('   HAT is active:', isActive ? '✅ Yes' : '❌ No');
      console.log();

      console.log('💡 DIAGNOSIS:');
      if (balance === 0n) {
        console.log('   Phase 3 (mintHat) either:');
        console.log('   - Failed silently');
        console.log('   - Minted to wrong address');
        console.log('   - Transaction pending/not confirmed');
      } else if (!isActive) {
        console.log('   HAT exists but is not active');
        console.log('   - Check HAT eligibility module');
        console.log('   - Check HAT toggle module');
      }

      return false;
    }

    console.log('✅ SUCCESS: User wears the management HAT!');
    console.log('\n   Authorization should work.');
    console.log('   If still failing, check paymaster whitelist.');
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

check()
  .then((success) => process.exit(success ? 0 : 1))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
