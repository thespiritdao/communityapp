const { createWalletClient, createPublicClient, http } = require('viem');
const { base } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

// CONFIGURATION
const PROXY_ADDRESS = '0x15bb499ca19046b48ea4b2b2c4b026d4fe0b926a';
const MANAGEMENT_HAT_ID =
  '3666553570037151104296619557127078756515624761922077834188833387708416';
const MEMBERSHIP_HAT_ID = '0'; // Set to 0 for now since it's pending

// IMPORTANT: You'll need to provide your private key to sign the transaction
// NEVER commit this file with your private key in it!
const PRIVATE_KEY = 'YOUR_PRIVATE_KEY_HERE'; // Replace with your wallet's private key

const proxyAbi = [
  {
    name: 'setHatIds',
    type: 'function',
    inputs: [
      { name: '_managementHatId', type: 'uint256' },
      { name: '_membershipHatId', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'managementHatId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'membershipHatId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
];

async function fixProxyHatIds() {
  console.log('🔧 === FIXING PROXY HAT IDs ===\n');
  console.log('Proxy Address:', PROXY_ADDRESS);
  console.log('Management HAT ID to set:', MANAGEMENT_HAT_ID);
  console.log('Membership HAT ID to set:', MEMBERSHIP_HAT_ID);
  console.log();

  if (PRIVATE_KEY === 'YOUR_PRIVATE_KEY_HERE') {
    console.log('❌ ERROR: Please set your private key in the script first!');
    console.log();
    console.log('To get your private key from Coinbase Wallet:');
    console.log('1. Open Coinbase Wallet');
    console.log('2. Go to Settings → Security');
    console.log('3. Click "Show private key"');
    console.log('4. Copy the private key and paste it in this script');
    console.log();
    console.log('⚠️  SECURITY WARNING:');
    console.log('   - Never share your private key');
    console.log('   - Never commit this file to git with your private key');
    console.log('   - Delete the private key from this file after running');
    return;
  }

  try {
    const account = privateKeyToAccount(`0x${PRIVATE_KEY.replace('0x', '')}`);

    const publicClient = createPublicClient({
      chain: base,
      transport: http(
        'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50',
      ),
    });

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(
        'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50',
      ),
    });

    console.log('👤 Your address:', account.address);
    console.log();

    // Check current state
    console.log('📊 Checking current proxy state...\n');

    const [currentManagementHatId, currentMembershipHatId] = await Promise.all([
      publicClient.readContract({
        address: PROXY_ADDRESS,
        abi: proxyAbi,
        functionName: 'managementHatId',
      }),
      publicClient.readContract({
        address: PROXY_ADDRESS,
        abi: proxyAbi,
        functionName: 'membershipHatId',
      }),
    ]);

    console.log(
      'Current Management HAT ID:',
      currentManagementHatId.toString(),
    );
    console.log(
      'Current Membership HAT ID:',
      currentMembershipHatId.toString(),
    );
    console.log();

    if (currentManagementHatId.toString() !== '0') {
      console.log('⚠️  WARNING: Management HAT ID is already set!');
      console.log('   Current value:', currentManagementHatId.toString());
      console.log('   This script will fail if HAT IDs are already set.');
      console.log();
      console.log(
        "   If you need to change it, you'll need to deploy a new proxy.",
      );
      return;
    }

    // Send transaction
    console.log('📤 Sending setHatIds transaction...\n');

    const hash = await walletClient.writeContract({
      address: PROXY_ADDRESS,
      abi: proxyAbi,
      functionName: 'setHatIds',
      args: [BigInt(MANAGEMENT_HAT_ID), BigInt(MEMBERSHIP_HAT_ID)],
    });

    console.log('✅ Transaction sent!');
    console.log('   Hash:', hash);
    console.log();
    console.log('⏳ Waiting for confirmation...\n');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log('✅ Transaction confirmed!');
      console.log('   Block:', receipt.blockNumber);
      console.log('   Gas used:', receipt.gasUsed.toString());
      console.log();

      // Verify the update
      console.log('🔍 Verifying HAT IDs were set correctly...\n');

      const [newManagementHatId, newMembershipHatId] = await Promise.all([
        publicClient.readContract({
          address: PROXY_ADDRESS,
          abi: proxyAbi,
          functionName: 'managementHatId',
        }),
        publicClient.readContract({
          address: PROXY_ADDRESS,
          abi: proxyAbi,
          functionName: 'membershipHatId',
        }),
      ]);

      console.log(
        '✅ Updated Management HAT ID:',
        newManagementHatId.toString(),
      );
      console.log(
        '✅ Updated Membership HAT ID:',
        newMembershipHatId.toString(),
      );
      console.log();

      if (newManagementHatId.toString() === MANAGEMENT_HAT_ID) {
        console.log('🎉 SUCCESS! Proxy HAT IDs have been set correctly!');
        console.log();
        console.log(
          '✅ Now try saving eligibility criteria again - it should work!',
        );
      } else {
        console.log("❌ ERROR: HAT IDs don't match expected values!");
      }
    } else {
      console.log('❌ Transaction failed!');
      console.log('   Receipt:', receipt);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log();

    if (error.message.includes('HAT IDs already set')) {
      console.log('💡 The proxy already has HAT IDs set.');
      console.log("   This is a one-time operation that can't be repeated.");
    } else if (error.message.includes('Not authorized')) {
      console.log('💡 You are not authorized to set HAT IDs.');
      console.log('   Only the factory or pod leaders can call this function.');
    } else {
      console.log('Stack trace:', error);
    }
  }
}

fixProxyHatIds().catch(console.error);
