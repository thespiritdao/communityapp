import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const USER_OP_HASH = '0xb2ffc5e0a7428d3a176f42123cd4539460526eff7536d6cc5498a7bfe5f201dd';
const BUNDLER_URL = 'https://api.developer.coinbase.com/rpc/v1/base/[REDACTED]';

async function checkUserOpStatus() {
  console.log(`\n🔍 Checking UserOperation Status...`);
  console.log(`📝 Hash: ${USER_OP_HASH}`);
  console.log(`🌐 Bundler: ${BUNDLER_URL}\n`);

  try {
    // Query the bundler for userOperation receipt
    const response = await fetch(BUNDLER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getUserOperationReceipt',
        params: [USER_OP_HASH],
      }),
    });

    const data = await response.json();
    console.log('📦 Response:', JSON.stringify(data, null, 2));

    if (data.result) {
      console.log('\n✅ UserOperation WAS processed!');
      console.log(`   Transaction Hash: ${data.result.receipt.transactionHash}`);
      console.log(`   Block Number: ${data.result.receipt.blockNumber}`);
      console.log(`   Success: ${data.result.success}`);
    } else if (data.error) {
      console.log('\n❌ Error from bundler:');
      console.log(`   Code: ${data.error.code}`);
      console.log(`   Message: ${data.error.message}`);
    } else {
      console.log('\n⏳ UserOperation not yet processed (still pending in bundler queue)');
      console.log('   This could mean:');
      console.log('   1. Still being processed (wait a few minutes)');
      console.log('   2. Failed simulation and was dropped');
      console.log('   3. Paymaster rejected it');
      console.log('   4. Gas estimation failed');
    }

  } catch (error) {
    console.error('\n❌ Error checking status:', error.message);
  }
}

checkUserOpStatus()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
