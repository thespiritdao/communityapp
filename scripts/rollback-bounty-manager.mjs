import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

// Contract addresses
const BOUNTY_MANAGER_V4 = '0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2';
const OLD_SYSTEM_TOKEN_V1 = '0xd67e460ce56be18b573aB434b3DC962c657D8Bb5';
const SELF_TOKEN = process.env.NEXT_PUBLIC_SELF_TOKEN;

const BOUNTY_MANAGER_ABI = [
  {
    inputs: [
      { name: '_systemToken', type: 'address' },
      { name: '_selfToken', type: 'address' }
    ],
    name: 'updatePrimaryTokens',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

async function main() {
  console.log('⚠️  ROLLBACK: BountyManagerV4 to SystemToken V1');
  console.log('This will revert BountyManagerV4 to use old SystemToken\n');

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ DEPLOYER_PRIVATE_KEY not found');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http()
  });

  const publicClient = createPublicClient({
    chain: base,
    transport: http()
  });

  console.log(`BountyManagerV4: ${BOUNTY_MANAGER_V4}`);
  console.log(`Old SystemToken: ${OLD_SYSTEM_TOKEN_V1}`);
  console.log(`Admin: ${account.address}\n`);

  console.log('📝 Reverting to SystemToken V1...');
  const hash = await walletClient.writeContract({
    address: BOUNTY_MANAGER_V4,
    abi: BOUNTY_MANAGER_ABI,
    functionName: 'updatePrimaryTokens',
    args: [OLD_SYSTEM_TOKEN_V1, SELF_TOKEN]
  });

  console.log(`Transaction: ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });

  console.log('✅ BountyManagerV4 rolled back to SystemToken V1');
}

main().catch(console.error);
