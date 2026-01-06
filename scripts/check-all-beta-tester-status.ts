/**
 * Check Beta Tester HAT + Advocate NFT status for all users
 */
import dotenv from 'dotenv';
import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';

dotenv.config();

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const ADVOCATE_ADDRESS = process.env.NEXT_PUBLIC_ADVOCATE as `0x${string}`;
const HATS_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as `0x${string}`;
const BETA_TESTER_HAT_ID = '0x000000880001000b000000000000000000000000000000000000000000000000' as const;

// From errors.txt - all 10 beta testers
const BETA_TESTERS = [
  { name: 'Jochen Weber', wallet: '0x8a23bde6b8a1832cd7119daed4a794027d74e71e' },
  { name: 'Eric Miki', wallet: '0x62421b696132bb635feba0e3cb2f305637cb7ead' },
  { name: 'Ryan Munn', wallet: '0xdfb6614e9de3822e13de08c6b050a448d417b2d6' },
  { name: 'Mariah McKay', wallet: '0xe3ddfd2b214d51316533181248a4106f83e4934c' },
  { name: 'Ron Rivers #1', wallet: '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48' },
  { name: 'Tressa Rivers', wallet: '0xaecf4d00f0e402fbeb0757f22be9062d89018106' },
  { name: 'Scott Graves', wallet: '0x21498071d1a52830fa398937a9a8f59c69d3fa7a' },
  { name: 'René Pinnell', wallet: '0x0259c4b65866d8f9e596052dbcdfc142c28b6329' },
  { name: 'Unknown User', wallet: '0xbe03115945680f518e53c4473e0e077ec7272923' },
  { name: 'Ron Rivers #2', wallet: '0x12a0cf22d632c859b793f852af03b9d515580244' },
];

const HATS_ABI = parseAbi([
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
]);

const ADVOCATE_ABI = parseAbi([
  'function balanceOf(address account) external view returns (uint256)',
]);

async function main() {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  console.log('🔍 BETA TESTER STATUS CHECK\n');
  console.log(`Beta Tester HAT: ${BETA_TESTER_HAT_ID}`);
  console.log(`Advocate NFT: ${ADVOCATE_ADDRESS}\n`);
  console.log('═'.repeat(80));

  let hasBetaTester = 0;
  let hasAdvocate = 0;
  let hasBoth = 0;
  let hasNeither = 0;

  for (const tester of BETA_TESTERS) {
    const addr = tester.wallet as `0x${string}`;

    // Check Beta Tester HAT balance
    const betaTesterBalance = await publicClient.readContract({
      address: HATS_ADDRESS,
      abi: HATS_ABI,
      functionName: 'balanceOf',
      args: [addr, BigInt(BETA_TESTER_HAT_ID)],
    });

    // Check Advocate NFT balance
    const advocateBalance = await publicClient.readContract({
      address: ADVOCATE_ADDRESS,
      abi: ADVOCATE_ABI,
      functionName: 'balanceOf',
      args: [addr],
    });

    const hasBeta = betaTesterBalance > 0n;
    const hasAdv = advocateBalance > 0n;

    // Count statuses
    if (hasBeta && hasAdv) hasBoth++;
    else if (hasBeta && !hasAdv) hasBetaTester++;
    else if (!hasBeta && hasAdv) hasAdvocate++;
    else hasNeither++;

    // Status indicators
    const betaStatus = hasBeta ? '✅' : '❌';
    const advStatus = hasAdv ? '✅' : '❌';

    console.log(`\n${tester.name}`);
    console.log(`  Wallet: ${addr}`);
    console.log(`  Beta Tester HAT: ${betaStatus} (${betaTesterBalance})`);
    console.log(`  Advocate NFT:    ${advStatus} (${advocateBalance})`);
  }

  console.log('\n' + '═'.repeat(80));
  console.log('\n📊 SUMMARY:');
  console.log(`   ✅ Has both Beta Tester + Advocate: ${hasBoth}`);
  console.log(`   ⚠️  Has Beta Tester only: ${hasBetaTester}`);
  console.log(`   ⚠️  Has Advocate only: ${hasAdvocate}`);
  console.log(`   ❌ Has neither: ${hasNeither}`);
  console.log(`\n   Total Beta Testers: ${BETA_TESTERS.length}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
