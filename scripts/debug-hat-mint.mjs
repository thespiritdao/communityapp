/**
 * Debug Hat Minting
 *
 * Tests the hat minting flow to see what's failing
 */

import dotenv from 'dotenv';
dotenv.config();

const BACKEND_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const TEST_WALLET = '0x0259c4b65866d8f9e596052dbcdfc142c28b6329'; // René's wallet

async function testHatMint() {
  console.log('🔍 Testing Hat Mint API\n');
  console.log('Test wallet:', TEST_WALLET);
  console.log('Backend URL:', BACKEND_URL);
  console.log('');

  try {
    console.log('📤 Calling /api/onboarding/mint-hat...');
    const response = await fetch(`${BACKEND_URL}/api/onboarding/mint-hat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress: TEST_WALLET,
        isFirstUser: false, // René is not first user
      }),
    });

    const result = await response.json();

    console.log('\n📋 Response:');
    console.log('Status:', response.status);
    console.log('Result:', JSON.stringify(result, null, 2));

    if (!result.success) {
      console.log('\n❌ MINTING FAILED');
      console.log('Error:', result.error);
      if (result.details) {
        console.log('Details:', result.details);
      }
    } else {
      console.log('\n✅ MINTING SUCCEEDED');
      if (result.alreadyHadHat) {
        console.log('User already had hat');
      } else {
        console.log('Transaction:', result.transactionHash);
      }
    }
  } catch (error) {
    console.error('\n❌ Error testing hat mint:', error);
  }
}

testHatMint().catch(console.error);
