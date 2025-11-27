import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const HATS_PROTOCOL_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';

const hatId = BigInt(
  '3666553570037155989126156067147814773746773803532600618919785347940352',
);
const hatIdHex = '0x' + hatId.toString(16).padStart(64, '0');

console.log('🔍 Checking if HAT exists on Base blockchain...\n');
console.log('HAT ID (decimal):', hatId.toString());
console.log('HAT ID (hex):', hatIdHex);
console.log('\n---\n');

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

try {
  const hatDetails = await publicClient.readContract({
    address: HATS_PROTOCOL_ADDRESS,
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
    args: [hatId],
  });

  console.log('✅ HAT EXISTS ON-CHAIN!\n');
  console.log('Details:', hatDetails[0]);
  console.log('Max Supply:', hatDetails[1]);
  console.log('Current Supply:', hatDetails[2]);
  console.log('Eligibility Module:', hatDetails[3]);
  console.log('Toggle Module:', hatDetails[4]);
  console.log('Image URI:', hatDetails[5]);
  console.log('Active:', hatDetails[8]);
} catch (error) {
  console.log('❌ HAT DOES NOT EXIST ON-CHAIN\n');
  console.log('Error:', error.message);

  if (
    error.message.includes('Position') &&
    error.message.includes('out of bounds')
  ) {
    console.log('\n🔍 Analysis:');
    console.log(
      'This HAT ID is structurally invalid according to Hats Protocol.',
    );
    console.log(
      'It was never minted on-chain, or the ID stored in the database is incorrect.',
    );
  }

  console.log('\n💡 Next Steps:');
  console.log('1. Check the proxy contract to see what HATs it actually owns');
  console.log('2. Mint a new management HAT for this pod');
  console.log('3. Update the database with the correct HAT ID');
}

process.exit(0);
