import dotenv from 'dotenv';
import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config();

async function main() {
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

  // Use Base public RPC (not Infura)
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  console.log(`Checking: ${account.address}`);

  const balance = await publicClient.getBalance({
    address: account.address,
  });

  console.log(`ETH Balance: ${formatEther(balance)} ETH`);

  if (Number(balance) >= 0.001e18) {
    console.log('✅ Ready for airdrop!');
  } else {
    console.log('⚠️  Still waiting for ETH...');
  }
}

main();
