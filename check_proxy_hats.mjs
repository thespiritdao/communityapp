import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const HATS_PROTOCOL_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
const PROXY_ADDRESS = '0x545e4226a2e6d4405c9d8c9ae705437ede88b9f7';

console.log('🔍 Checking what HATs the proxy contract owns...\n');
console.log('Proxy Address:', PROXY_ADDRESS);
console.log('\n---\n');

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

// Check if the proxy is wearing specific HATs by checking balanceOf
// We'll need to check a few common HAT IDs

const potentialHatIds = [
  136n, // Common top hat ID from exec pod
  BigInt(
    '3666553570037155989126156067147814773746773803532600618919785347940352',
  ), // The one in database
];

console.log('Checking if proxy wears any HATs...\n');

for (const hatId of potentialHatIds) {
  try {
    const balance = await publicClient.readContract({
      address: HATS_PROTOCOL_ADDRESS,
      abi: [
        {
          name: 'balanceOf',
          type: 'function',
          inputs: [
            { name: 'wearer', type: 'address' },
            { name: 'hatId', type: 'uint256' },
          ],
          outputs: [{ type: 'uint256' }],
          stateMutability: 'view',
        },
      ],
      functionName: 'balanceOf',
      args: [PROXY_ADDRESS, hatId],
    });

    const hatIdHex = '0x' + hatId.toString(16).padStart(64, '0');
    console.log(`HAT ${hatIdHex}:`);
    console.log(`  Balance: ${balance.toString()}`);
    console.log(`  Wearing: ${balance > 0n ? '✅ YES' : '❌ NO'}`);
    console.log('');
  } catch (error) {
    const hatIdHex = '0x' + hatId.toString(16).padStart(64, '0');
    console.log(`HAT ${hatIdHex}:`);
    console.log(`  Error checking: ${error.shortMessage || error.message}`);
    console.log('');
  }
}

// Also check if proxy is wearing ANY hats at all using the isWearerOfHat function
console.log('---\n');
console.log('Alternative check: Does proxy have admin rights on any HATs?');
console.log('(This would help us find the actual HAT IDs it controls)\n');

// We can also check events to see what HATs were minted to this address
console.log('💡 To find all HATs owned by this proxy, you would need to:');
console.log('1. Query HatMinted events from the Hats Protocol contract');
console.log('2. Filter for events where the recipient is:', PROXY_ADDRESS);
console.log("3. Or check Basescan for this address's HAT token holdings");

process.exit(0);
