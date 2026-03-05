/**
 * Deploy PodCreationManagerFactory to Base mainnet.
 *
 * Usage:
 *   PRIVATE_KEY=0x... node scripts/deploy-pod-creation-manager-factory.cjs
 *
 * After deployment:
 *   1. Set NEXT_PUBLIC_POD_CREATION_MANAGER_FACTORY=<address> in Vercel env
 *   2. Update pods.creation_manager_address for the community parent pod:
 *      UPDATE pods SET creation_manager_address = '<COMMUNITY_MANAGER_ADDRESS>'
 *      WHERE id = '86d2d359-2e38-4267-b7b7-c7f6155063e2';
 */

const { createWalletClient, createPublicClient, http } = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

// Paste compiled bytecode from `forge build` or `hardhat compile` output here
// forge build && cat out/PodCreationManagerFactory.sol/PodCreationManagerFactory.json | jq -r '.bytecode.object'
const FACTORY_BYTECODE = process.env.FACTORY_BYTECODE;

const HATS_CONTRACT = process.env.NEXT_PUBLIC_HATS_CONTRACT;
const TREASURY_FACTORY = process.env.NEXT_PUBLIC_POD_TREASURY_FACTORY || process.env.NEXT_PUBLIC_TREASURY_FACTORY;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

async function main() {
  if (!FACTORY_BYTECODE) {
    console.error('❌ FACTORY_BYTECODE env var required. Compile contract first:\n  forge build\n  cat out/PodCreationManagerFactory.sol/PodCreationManagerFactory.json | jq -r \'.bytecode.object\'');
    process.exit(1);
  }
  if (!HATS_CONTRACT || !TREASURY_FACTORY || !PRIVATE_KEY) {
    console.error('❌ Missing: NEXT_PUBLIC_HATS_CONTRACT, NEXT_PUBLIC_POD_TREASURY_FACTORY, PRIVATE_KEY');
    process.exit(1);
  }

  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });

  console.log('Deploying PodCreationManagerFactory...');
  console.log('  hatsContract:', HATS_CONTRACT);
  console.log('  treasuryFactory:', TREASURY_FACTORY);
  console.log('  deployer:', account.address);

  const hash = await walletClient.deployContract({
    abi: [
      {
        type: 'constructor',
        inputs: [
          { name: '_hatsContract', type: 'address' },
          { name: '_treasuryFactory', type: 'address' },
        ],
        stateMutability: 'nonpayable',
      },
    ],
    bytecode: FACTORY_BYTECODE,
    args: [HATS_CONTRACT, TREASURY_FACTORY],
  });

  console.log('Transaction hash:', hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('✅ PodCreationManagerFactory deployed at:', receipt.contractAddress);
  console.log('\nNext steps:');
  console.log('  1. Set NEXT_PUBLIC_POD_CREATION_MANAGER_FACTORY=' + receipt.contractAddress);
  console.log('  2. Run the SQL migration: scripts/db-migrations/004_sub_pods_and_creation_manager.sql');
  console.log('  3. Backfill community pod manager address in DB');
}

main().catch(console.error);
