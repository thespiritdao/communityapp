import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

// Contract addresses
const EVENT_MANAGER = '0x5e77aD7dD2C93E19aad6ab3c0a8829b729fEA3F9';
const OLD_SYSTEM_TOKEN_V1 = '0xd67e460ce56be18b573aB434b3DC962c657D8Bb5';
const SELF_TOKEN = process.env.NEXT_PUBLIC_SELF_TOKEN;

const EVENT_MANAGER_ABI = [
  {
    inputs: [
      { name: '_systemToken', type: 'address' },
      { name: '_selfToken', type: 'address' }
    ],
    name: 'updateTokenAddresses',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

async function main() {
  console.log('⚠️  ROLLBACK: EventManager to SystemToken V1');
  console.log('This will revert EventManager to use old SystemToken\n');

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

  console.log(`EventManager: ${EVENT_MANAGER}`);
  console.log(`Old SystemToken: ${OLD_SYSTEM_TOKEN_V1}`);
  console.log(`Admin: ${account.address}\n`);

  console.log('📝 Reverting to SystemToken V1...');
  const hash = await walletClient.writeContract({
    address: EVENT_MANAGER,
    abi: EVENT_MANAGER_ABI,
    functionName: 'updateTokenAddresses',
    args: [OLD_SYSTEM_TOKEN_V1, SELF_TOKEN]
  });

  console.log(`Transaction: ${hash}`);
  await publicClient.waitForTransactionReceipt({ hash });

  console.log('✅ EventManager rolled back to SystemToken V1');
}

main().catch(console.error);
