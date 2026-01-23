import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const CRON_SECRET = process.env.CRON_SECRET;
const VERCEL_URL = process.env.NEXT_PUBLIC_VERCEL_URL || 'http://localhost:3000';

async function testBountyCron() {
  console.log('\n🧪 Testing Bounty Cron Job...');
  console.log(`📍 URL: ${VERCEL_URL}/api/cron/update-pending-bounties-v3`);
  console.log(`🔐 Using CRON_SECRET: ${CRON_SECRET?.slice(0, 10)}...`);

  try {
    const response = await fetch(`${VERCEL_URL}/api/cron/update-pending-bounties-v3`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`\n📊 Response Status: ${response.status} ${response.statusText}`);

    const data = await response.json();
    console.log('\n📦 Response Body:');
    console.log(JSON.stringify(data, null, 2));

    if (data.success) {
      console.log('\n✅ Bounty Cron Job Test PASSED');
    } else {
      console.log('\n❌ Bounty Cron Job Test FAILED');
    }
  } catch (error) {
    console.error('\n❌ Error testing bounty cron:', error.message);
    throw error;
  }
}

testBountyCron()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
