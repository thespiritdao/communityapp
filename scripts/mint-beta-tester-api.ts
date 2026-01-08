// scripts/mint-beta-tester-api.ts
// Call the /api/onboarding/mint-hat endpoint to mint Beta Tester HAT
// Wallet: 0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48

const EXEC_POD_HOLDER = '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48';
const API_URL = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';

async function main() {
  console.log('🎩 Minting Beta Tester HAT via API');
  console.log('====================================');
  console.log('Wallet:', EXEC_POD_HOLDER);
  console.log('API URL:', `${API_URL}/api/onboarding/mint-hat`);
  console.log('');

  try {
    console.log('📤 Calling mint-hat API...');

    const response = await fetch(`${API_URL}/api/onboarding/mint-hat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        walletAddress: EXEC_POD_HOLDER,
        isFirstUser: false, // Beta Tester, not Executive Leader
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ API request failed');
      console.error('   Status:', response.status);
      console.error('   Response:', data);
      throw new Error(data.error || 'API request failed');
    }

    console.log('✅ API Response:');
    console.log('   Success:', data.success);

    if (data.alreadyHadHat) {
      console.log('   User already has Beta Tester HAT');
    } else {
      console.log('   Transaction hash:', data.transactionHash);
      console.log('   Mode:', data.mode);
      console.log('   Message:', data.message);
    }

    console.log('');
    console.log('🎉 Beta Tester HAT minting complete!');
    console.log('');
    console.log('Next steps:');
    console.log('1. User should refresh spiritdao.org/pods');
    console.log('2. Exec Pod management panel should now be visible');
    console.log('3. Verify Beta Tester HAT appears in identity page');

    if (data.transactionHash) {
      console.log('');
      console.log('View on Basescan:');
      console.log(`https://basescan.org/tx/${data.transactionHash}`);
    }

  } catch (error: any) {
    console.error('❌ Script failed:');
    console.error(error.message || error);
    process.exit(1);
  }
}

main()
  .then(() => {
    console.log('');
    console.log('Script completed successfully ✓');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
