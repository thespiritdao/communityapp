/**
 * Diagnostic script to check why specific mints failed
 */
import dotenv from 'dotenv';
import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';

dotenv.config();

const ADVOCATE_ADDRESS = process.env.NEXT_PUBLIC_ADVOCATE as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

const FAILED_ADDRESSES = [
  '0x62421b696132bb635feba0e3cb2f305637cb7ead', // Eric Miki
  '0xe3ddfd2b214d51316533181248a4106f83e4934c', // Mariah McKay
  '0xaecf4d00f0e402fbeb0757f22be9062d89018106', // Tressa Rivers
  '0x0259c4b65866d8f9e596052dbcdfc142c28b6329', // René Pinnell
  '0x12a0cf22d632c859b793f852af03b9d515580244', // Ron Rivers #2
];

const SUCCEEDED_ADDRESSES = [
  '0x8a23bde6b8a1832cd7119daed4a794027d74e71e', // Jochen Weber
  '0xdfb6614e9de3822e13de08c6b050a448d417b2d6', // Ryan Munn
  '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48', // Ron Rivers #1
  '0x21498071d1a52830fa398937a9a8f59c69d3fa7a', // Scott Graves
  '0xbe03115945680f518e53c4473e0e077ec7272923', // Unknown User
];

const ADVOCATE_ABI = parseAbi([
  'function balanceOf(address account) external view returns (uint256)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function totalSupply() external view returns (uint256)',
]);

async function main() {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  console.log('🔍 Diagnosing Failed Mints\n');
  console.log(`Advocate NFT: ${ADVOCATE_ADDRESS}\n`);

  // Check total supply
  const totalSupply = await publicClient.readContract({
    address: ADVOCATE_ADDRESS,
    abi: ADVOCATE_ABI,
    functionName: 'totalSupply',
  });
  console.log(`📊 Total Supply: ${totalSupply}\n`);

  // Check failed addresses
  console.log('❌ FAILED ADDRESSES:');
  for (const addr of FAILED_ADDRESSES) {
    const balance = await publicClient.readContract({
      address: ADVOCATE_ADDRESS,
      abi: ADVOCATE_ABI,
      functionName: 'balanceOf',
      args: [addr as `0x${string}`],
    });

    // Check if address is a contract
    const code = await publicClient.getBytecode({ address: addr as `0x${string}` });
    const isContract = code && code !== '0x';

    console.log(`  ${addr}`);
    console.log(`    Balance: ${balance}`);
    console.log(`    Is Contract: ${isContract ? 'YES ⚠️' : 'NO'}`);
  }

  console.log('\n✅ SUCCEEDED ADDRESSES:');
  for (const addr of SUCCEEDED_ADDRESSES) {
    const balance = await publicClient.readContract({
      address: ADVOCATE_ADDRESS,
      abi: ADVOCATE_ABI,
      functionName: 'balanceOf',
      args: [addr as `0x${string}`],
    });

    // Check if address is a contract
    const code = await publicClient.getBytecode({ address: addr as `0x${string}` });
    const isContract = code && code !== '0x';

    console.log(`  ${addr}`);
    console.log(`    Balance: ${balance}`);
    console.log(`    Is Contract: ${isContract ? 'YES' : 'NO'}`);
  }

  console.log('\n📌 ANALYSIS:');
  console.log('If failed addresses are smart contracts, _safeMint may be reverting');
  console.log('because they do not implement ERC721Receiver interface.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
