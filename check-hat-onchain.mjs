import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const HATS_CONTRACT = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
const TEST_HAT_ID_DECIMAL =
  '3666553570037155989126156067147814773746773803532600618919785347940352';
const TEST_HAT_ID_HEX =
  '0x0000008800020058003800000000000000000000000000000000000000000000';

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

async function checkHatOnchain() {
  console.log('🔍 Checking HAT ID onchain...');
  console.log('Hat ID (decimal):', TEST_HAT_ID_DECIMAL);
  console.log('Hat ID (hex):', TEST_HAT_ID_HEX);
  console.log('Hat ID (BigInt):', BigInt(TEST_HAT_ID_DECIMAL).toString());

  try {
    const hatDetails = await publicClient.readContract({
      address: HATS_CONTRACT,
      abi: [
        {
          name: 'viewHat',
          type: 'function',
          inputs: [{ name: '_hatId', type: 'uint256' }],
          outputs: [
            {
              type: 'tuple',
              components: [
                { name: 'details', type: 'string' },
                { name: 'maxSupply', type: 'uint32' },
                { name: 'supply', type: 'uint32' },
                { name: 'eligibility', type: 'address' },
                { name: 'toggle', type: 'address' },
                { name: 'imageURI', type: 'string' },
                { name: 'lastHatId', type: 'uint16' },
                { name: 'mutable', type: 'bool' },
                { name: 'active', type: 'bool' },
              ],
            },
          ],
          stateMutability: 'view',
        },
      ],
      functionName: 'viewHat',
      args: [BigInt(TEST_HAT_ID_DECIMAL)],
    });

    console.log('\n✅ HAT EXISTS ONCHAIN!');
    console.log('Details:', hatDetails[0]);
    console.log('Max Supply:', hatDetails[1]);
    console.log('Current Supply:', hatDetails[2]);
    console.log('Eligibility Module:', hatDetails[3]);
    console.log('Toggle Module:', hatDetails[4]);
    console.log('Image URI:', hatDetails[5]);
    console.log('Last Child Hat ID:', hatDetails[6]);
    console.log('Mutable:', hatDetails[7]);
    console.log('Active:', hatDetails[8]);

    // Try to parse details as JSON
    try {
      const detailsObj = JSON.parse(hatDetails[0]);
      console.log('\n📝 Parsed Details:');
      console.log(JSON.stringify(detailsObj, null, 2));
    } catch (e) {
      console.log('\n📝 Details (not JSON):', hatDetails[0]);
    }
  } catch (error) {
    console.error('\n❌ HAT DOES NOT EXIST OR ERROR OCCURRED:');
    console.error('Error message:', error.message);
    console.error('Error cause:', error.cause?.message || 'N/A');

    if (
      error.message?.includes('Position') ||
      error.cause?.message?.includes('Position')
    ) {
      console.log(
        '\n⚠️ This indicates the HAT ID structure is invalid or the HAT was never created onchain',
      );
    }
  }
}

checkHatOnchain();
