// scripts/register-treasury-in-factory.ts
// Register existing treasury with PodTreasuryFactory

import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Configuration
const FACTORY_ADDRESS = '0xb9e3D01C144c5Bfcd5816afea9190371B0843be6' as const;
const TREASURY_ADDRESS = '0xf00ca2682a8128affaada61c57322f0e6061c9e4' as const;
const POD_ID = 'e35c9e25-d29f-4988-b1e8-2902e960b94c';
const MANAGEMENT_HAT_ID = '0x0000008800010000000000000000000000000000000000000000000000000000';

// Convert hex hat ID to uint256
const hatIdBigInt = BigInt(MANAGEMENT_HAT_ID);

const factoryABI = parseAbi([
  'function registerExistingTreasury(string memory podId, address treasuryAddress, uint256 managementHatId) external',
  'function owner() external view returns (address)',
  'function isPodTreasuryDeployed(string memory podId) external view returns (bool)',
  'function getTreasuryForPod(string memory podId) external view returns (address)',
]);

async function main() {
  // Setup client
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });

  console.log('🔍 Checking current factory state...\n');

  // Check if already registered
  const isDeployed = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: factoryABI,
    functionName: 'isPodTreasuryDeployed',
    args: [POD_ID],
  });

  console.log(`Pod ID: ${POD_ID}`);
  console.log(`Treasury Address: ${TREASURY_ADDRESS}`);
  console.log(`Management Hat ID: ${MANAGEMENT_HAT_ID}`);
  console.log(`Is Registered: ${isDeployed}\n`);

  if (isDeployed) {
    const registeredAddress = await publicClient.readContract({
      address: FACTORY_ADDRESS,
      abi: factoryABI,
      functionName: 'getTreasuryForPod',
      args: [POD_ID],
    });

    console.log('✅ Treasury is already registered!');
    console.log(`Registered Address: ${registeredAddress}`);

    if (registeredAddress.toLowerCase() === TREASURY_ADDRESS.toLowerCase()) {
      console.log('✅ Address matches! No action needed.');
    } else {
      console.log('⚠️ WARNING: Registered address does NOT match expected address!');
      console.log(`Expected: ${TREASURY_ADDRESS}`);
      console.log(`Got: ${registeredAddress}`);
    }
    return;
  }

  console.log('❌ Treasury NOT registered in factory.\n');

  // Check factory owner
  const owner = await publicClient.readContract({
    address: FACTORY_ADDRESS,
    abi: factoryABI,
    functionName: 'owner',
  });

  console.log(`Factory Owner: ${owner}`);
  console.log('\n📋 To register the treasury, the factory owner must call:');
  console.log(`registerExistingTreasury(`);
  console.log(`  "${POD_ID}",`);
  console.log(`  "${TREASURY_ADDRESS}",`);
  console.log(`  ${hatIdBigInt.toString()}`);
  console.log(`)\n`);

  // Check if we have the private key to do it automatically
  if (process.env.DEPLOYER_PRIVATE_KEY) {
    const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`);

    if (account.address.toLowerCase() !== owner.toLowerCase()) {
      console.log(`⚠️ Your address (${account.address}) is NOT the factory owner.`);
      console.log(`You need to use the owner's private key or ask them to register.`);
      return;
    }

    console.log('🔑 Private key found. Attempting to register...\n');

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL),
    });

    try {
      const hash = await walletClient.writeContract({
        address: FACTORY_ADDRESS,
        abi: factoryABI,
        functionName: 'registerExistingTreasury',
        args: [POD_ID, TREASURY_ADDRESS, hatIdBigInt],
      });

      console.log(`✅ Transaction sent: ${hash}`);
      console.log('⏳ Waiting for confirmation...');

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        console.log('✅ Treasury registered successfully!');
        console.log(`Transaction: ${hash}`);
      } else {
        console.log('❌ Transaction failed');
      }
    } catch (error) {
      console.error('❌ Error registering treasury:', error);
    }
  } else {
    console.log('⚠️ No DEPLOYER_PRIVATE_KEY found in environment.');
    console.log('Add the factory owner private key to register automatically.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
