import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const NEW_FACTORY = '0xDc8D13079A789f5aF1F0c3B6c9dF351Af502DB99';
const EXEC_POD_ID = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';

const FACTORY_ABI = [
  {
    name: 'getPodTreasuryAddress',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'podProxies',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
];

const client = createPublicClient({
  chain: base,
  transport: http(
    process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org',
  ),
});

console.log('🔍 Verifying new PodAuthorizationFactory deployment...\n');
console.log(`New Factory: ${NEW_FACTORY}`);
console.log(`Pod ID: ${EXEC_POD_ID}\n`);

try {
  // Check if pod proxy exists
  const proxyAddress = await client.readContract({
    address: NEW_FACTORY,
    abi: FACTORY_ABI,
    functionName: 'podProxies',
    args: [EXEC_POD_ID],
  });

  console.log(`Proxy address: ${proxyAddress}`);

  if (proxyAddress === '0x0000000000000000000000000000000000000000') {
    console.log('\n❌ Pod not registered in new factory!');
    console.log('You need to create the pod proxy first.');
  } else {
    console.log('✅ Pod proxy exists!\n');

    // Try to call getPodTreasuryAddress
    const treasury = await client.readContract({
      address: NEW_FACTORY,
      abi: FACTORY_ABI,
      functionName: 'getPodTreasuryAddress',
      args: [EXEC_POD_ID],
    });

    console.log(`Treasury address: ${treasury}`);

    if (treasury === '0x0000000000000000000000000000000000000000') {
      console.log('\n⚠️ Treasury address is null');
    } else {
      console.log('\n✅ getPodTreasuryAddress() works!');
      console.log('✅ New factory is ready to use');
    }
  }
} catch (error) {
  console.error('\n❌ Error:', error.message);
  if (error.message.includes('getPodTreasuryAddress')) {
    console.log(
      '\n⚠️ Function might not exist - did the contract compile correctly?',
    );
  }
}
