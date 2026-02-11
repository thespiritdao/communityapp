import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

// Contract addresses
const BOUNTY_MANAGER_V4 = '0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2';
const EVENT_MANAGER = '0x5e77aD7dD2C93E19aad6ab3c0a8829b729fEA3F9';
const SELF_TOKEN = process.env.NEXT_PUBLIC_SELF_TOKEN;

// New SystemTokenV2 address (from deployment)
const SYSTEM_TOKEN_V2 = process.env.SYSTEM_TOKEN_V2;

// Contract ABIs
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
  },
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'allowed', type: 'bool' }
    ],
    name: 'setTokenAllowed',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

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

async function updateBountyManager() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('📝 UPDATING BOUNTY MANAGER V4');
  console.log(`${'='.repeat(70)}`);
  console.log(`Contract: ${BOUNTY_MANAGER_V4}`);
  console.log(`New SystemToken: ${SYSTEM_TOKEN_V2}`);
  console.log(`SelfToken: ${SELF_TOKEN}\n`);

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

  console.log(`Admin wallet: ${account.address}\n`);

  // Step 1: Update primary tokens
  console.log('📋 Step 1: Calling updatePrimaryTokens()...');
  try {
    const hash = await walletClient.writeContract({
      address: BOUNTY_MANAGER_V4,
      abi: BOUNTY_MANAGER_ABI,
      functionName: 'updatePrimaryTokens',
      args: [SYSTEM_TOKEN_V2, SELF_TOKEN]
    });

    console.log(`   Transaction: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log('   ✅ Primary tokens updated');

  } catch (error) {
    console.error('   ❌ Failed:', error.message);
    return false;
  }

  // Step 2: Whitelist SystemTokenV2
  console.log('\n📋 Step 2: Whitelisting SystemTokenV2...');
  try {
    const hash = await walletClient.writeContract({
      address: BOUNTY_MANAGER_V4,
      abi: BOUNTY_MANAGER_ABI,
      functionName: 'setTokenAllowed',
      args: [SYSTEM_TOKEN_V2, true]
    });

    console.log(`   Transaction: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log('   ✅ SystemTokenV2 whitelisted');

  } catch (error) {
    console.error('   ❌ Failed:', error.message);
    return false;
  }

  console.log('\n✅ BountyManagerV4 updated successfully!');
  return true;
}

async function updateEventManager() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('📝 UPDATING EVENT MANAGER');
  console.log(`${'='.repeat(70)}`);
  console.log(`Contract: ${EVENT_MANAGER}`);
  console.log(`New SystemToken: ${SYSTEM_TOKEN_V2}`);
  console.log(`SelfToken: ${SELF_TOKEN}\n`);

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
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

  console.log(`Admin wallet: ${account.address}\n`);

  console.log('📋 Calling updateTokenAddresses()...');
  try {
    const hash = await walletClient.writeContract({
      address: EVENT_MANAGER,
      abi: EVENT_MANAGER_ABI,
      functionName: 'updateTokenAddresses',
      args: [SYSTEM_TOKEN_V2, SELF_TOKEN]
    });

    console.log(`   Transaction: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log('   ✅ Token addresses updated');

  } catch (error) {
    console.error('   ❌ Failed:', error.message);
    return false;
  }

  console.log('\n✅ EventManager updated successfully!');
  return true;
}

async function main() {
  console.log('🔄 UPDATING EXISTING CONTRACTS');
  console.log('This will update BountyManagerV4 and EventManager\n');

  // Validate environment
  if (!SYSTEM_TOKEN_V2) {
    console.error('❌ SYSTEM_TOKEN_V2 not set in environment');
    console.log('Set: export SYSTEM_TOKEN_V2=0x...');
    process.exit(1);
  }

  if (!SELF_TOKEN) {
    console.error('❌ NEXT_PUBLIC_SELF_TOKEN not found');
    process.exit(1);
  }

  // Update contracts
  const bountySuccess = await updateBountyManager();
  const eventSuccess = await updateEventManager();

  console.log(`\n${'='.repeat(70)}`);
  console.log('📊 UPDATE SUMMARY');
  console.log(`${'='.repeat(70)}`);
  console.log(`BountyManagerV4: ${bountySuccess ? '✅ Updated' : '❌ Failed'}`);
  console.log(`EventManager: ${eventSuccess ? '✅ Updated' : '❌ Failed'}`);

  if (bountySuccess && eventSuccess) {
    console.log('\n✅ All contracts updated successfully!');
  } else {
    console.log('\n⚠️  Some updates failed. Review errors above.');
  }

  console.log(`${'='.repeat(70)}\n`);
}

main().catch(console.error);
