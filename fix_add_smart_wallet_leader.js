// Fix: Add Smart Wallet as Leader to Pod Proxy
// This allows your smart wallet to manage the pod even though the HAT is on your EOA

const { createWalletClient, custom } = require('viem');
const { base } = require('viem/chains');

const PROXY_ADDRESS = '0x36237b3EeE30F08417C0EA0a84897c457669DDA0'; // Test Pod V2-52 proxy
const YOUR_EOA = '0x12a0cf22D632c859B793F852af03b9d515580244'; // This address owns the HAT

// YOU NEED TO REPLACE THIS with your smart wallet address!
const YOUR_SMART_WALLET = '0x...'; // ← CHECK YOUR CONNECTED ADDRESS IN THE UI!

const proxyAbi = [{
  name: 'addLeader',
  type: 'function',
  inputs: [{ name: 'newLeader', type: 'address' }],
  outputs: [],
  stateMutability: 'nonpayable'
}];

async function addSmartWalletAsLeader() {
  if (!YOUR_SMART_WALLET || YOUR_SMART_WALLET === '0x...') {
    console.error('❌ ERROR: You need to set YOUR_SMART_WALLET address first!');
    console.log('Find it by checking what address is shown when connected to the app.');
    return;
  }

  console.log('🔧 Adding smart wallet as pod leader...');
  console.log('  Proxy:', PROXY_ADDRESS);
  console.log('  Current leader (EOA):', YOUR_EOA);
  console.log('  New leader (Smart Wallet):', YOUR_SMART_WALLET);
  console.log();

  try {
    // Create wallet client
    const walletClient = createWalletClient({
      chain: base,
      transport: custom(window.ethereum)
    });

    // Call addLeader on proxy
    // NOTE: This transaction will be sent from your EOA (which owns the HAT and can manage)
    const hash = await walletClient.writeContract({
      address: PROXY_ADDRESS,
      abi: proxyAbi,
      functionName: 'addLeader',
      args: [YOUR_SMART_WALLET],
      account: YOUR_EOA
    });

    console.log('✅ Transaction sent!');
    console.log('   Hash:', hash);
    console.log();
    console.log('⏳ Waiting for confirmation...');

    // Wait for transaction
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log('🎉 SUCCESS! Smart wallet added as leader.');
      console.log('   You can now manage pod eligibility criteria.');
      console.log();
      console.log('   Try adding criteria again in the UI!');
    } else {
      console.log('❌ Transaction reverted');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run in browser console:
// 1. First, find your smart wallet address (check UI when connected)
// 2. Edit this file and set YOUR_SMART_WALLET
// 3. Run: node fix_add_smart_wallet_leader.js

console.log('⚠️  SETUP REQUIRED:');
console.log('   1. Check what address shows in the UI when you connect your wallet');
console.log('   2. Edit this file and set YOUR_SMART_WALLET = that address');
console.log('   3. Then run this script');
