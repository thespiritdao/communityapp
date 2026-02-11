import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, base } from 'viem/chains';

// Configuration
const SYSTEM_TOKEN_V2_ADDRESS = process.env.SYSTEM_TOKEN_V2_ADDRESS;
const NETWORK = process.argv[2] || 'testnet';

const SYSTEM_TOKEN_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'canMint',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'hatsProtocol',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'executiveHatId',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
];

async function main() {
  console.log('🧪 SystemTokenV2 Minting Test');
  console.log(`Network: ${NETWORK === 'testnet' ? 'Base Sepolia' : 'Base Mainnet'}\n`);

  if (!SYSTEM_TOKEN_V2_ADDRESS) {
    console.error('❌ SYSTEM_TOKEN_V2_ADDRESS not found in environment');
    console.log('Set: export SYSTEM_TOKEN_V2_ADDRESS=0x...');
    process.exit(1);
  }

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ DEPLOYER_PRIVATE_KEY not found');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  const chain = NETWORK === 'testnet' ? baseSepolia : base;

  const publicClient = createPublicClient({
    chain,
    transport: http()
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http()
  });

  console.log(`SystemTokenV2: ${SYSTEM_TOKEN_V2_ADDRESS}`);
  console.log(`Test wallet: ${account.address}\n`);

  // Step 1: Read contract configuration
  console.log('📖 Reading contract configuration...');
  const hatsProtocol = await publicClient.readContract({
    address: SYSTEM_TOKEN_V2_ADDRESS,
    abi: SYSTEM_TOKEN_ABI,
    functionName: 'hatsProtocol'
  });
  console.log(`   Hats Protocol: ${hatsProtocol}`);

  const executiveHatId = await publicClient.readContract({
    address: SYSTEM_TOKEN_V2_ADDRESS,
    abi: SYSTEM_TOKEN_ABI,
    functionName: 'executiveHatId'
  });
  console.log(`   Executive Hat ID: ${executiveHatId}`);

  // Step 2: Check if test wallet can mint
  console.log('\n🔍 Checking mint permission...');
  const canMint = await publicClient.readContract({
    address: SYSTEM_TOKEN_V2_ADDRESS,
    abi: SYSTEM_TOKEN_ABI,
    functionName: 'canMint',
    args: [account.address]
  });
  console.log(`   Can ${account.address} mint? ${canMint ? '✅ YES' : '❌ NO'}`);

  if (!canMint) {
    console.log('\n⚠️  Test wallet cannot mint!');
    console.log('   Either:');
    console.log('   1. This wallet must wear the Executive Hat');
    console.log('   2. Grant EXECUTIVE_ROLE to this wallet');
    console.log('\n   Skipping mint test...');
    return;
  }

  // Step 3: Test minting
  console.log('\n🪙 Testing mint function...');
  const testRecipient = '0x0000000000000000000000000000000000000001'; // Burn address for testing
  const testAmount = parseEther('1'); // 1 token

  try {
    const hash = await walletClient.writeContract({
      address: SYSTEM_TOKEN_V2_ADDRESS,
      abi: SYSTEM_TOKEN_ABI,
      functionName: 'mint',
      args: [testRecipient, testAmount]
    });

    console.log(`   Transaction hash: ${hash}`);
    console.log('   Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`   ✅ Minted 1 token to ${testRecipient}`);
    console.log(`   Gas used: ${receipt.gasUsed}`);

  } catch (error) {
    console.error('   ❌ Mint failed:', error.message);
  }

  console.log('\n✅ Test complete!');
}

main().catch(console.error);
