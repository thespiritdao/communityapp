const { createPublicClient, http } = require('viem');
const { base } = require('viem/chains');

// CONFIGURATION
const YOUR_EOA_ADDRESS = '0x12a0cf22D632c859B793F852af03b9d515580244'; // Your EOA

const client = createPublicClient({
  chain: base,
  transport: http(
    'https://base-mainnet.infura.io/v3/f1103e203835402d94489e605683ff50',
  ),
});

async function findSmartWallet() {
  console.log('🔍 === FINDING YOUR COINBASE SMART WALLET ===\n');
  console.log('Your EOA:', YOUR_EOA_ADDRESS);
  console.log();

  // Coinbase Smart Wallet Factory address on Base
  const SMART_WALLET_FACTORY = '0x0BA5ED0c6AA8c49038F819E587E2633c4A9F428a';

  console.log('📋 INSTRUCTIONS TO FIND YOUR SMART WALLET ADDRESS:\n');
  console.log('Method 1: Check Coinbase Wallet');
  console.log('  1. Open Coinbase Wallet app/extension');
  console.log('  2. Go to Settings → Developer Settings');
  console.log(
    '  3. Look for "Smart Wallet Address" or "Smart Contract Address"',
  );
  console.log();

  console.log('Method 2: Check Recent Transactions');
  console.log('  1. Go to https://basescan.org/address/' + YOUR_EOA_ADDRESS);
  console.log('  2. Look at "Internal Txns" tab');
  console.log('  3. Find transactions where your EOA deployed a contract');
  console.log('  4. That contract address is your smart wallet');
  console.log();

  console.log('Method 3: Check Transaction Logs from Eligibility Sync Error');
  console.log(
    '  When you tried to save eligibility criteria, what address sent the transaction?',
  );
  console.log(
    '  Check the Coinbase popup or browser console for the "from" address',
  );
  console.log("  If it's different from your EOA, that's your smart wallet!");
  console.log();

  console.log("❓ Do you know if you're using a Coinbase Smart Wallet?");
  console.log(
    '   - If you connected with "Coinbase Wallet" and it\'s a recent account, you\'re likely using a smart wallet',
  );
  console.log(
    '   - If you have an older Coinbase Wallet, it might just be an EOA',
  );
  console.log();

  console.log(
    "💡 ALTERNATIVE: Let's check on-chain what address is trying to manage the pod\n",
  );
  console.log(
    'When you see "Not authorized to manage pod", check the transaction details:',
  );
  console.log('  - Open browser DevTools (F12)');
  console.log('  - Go to Console tab');
  console.log('  - Look for the transaction error');
  console.log('  - Find the "from" address in the error details');
  console.log("  - That's the address being rejected!");
}

findSmartWallet().catch(console.error);
