import 'dotenv/config';

console.log('═══════════════════════════════════════════════════════════════');
console.log('📋 GRANT EXECUTIVE_ROLE TO MINTING WALLET');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('⚠️  IMPORTANT: The minting wallet address will be generated when');
console.log('   the first mint attempt is made. Until then, we don\'t know the address.\n');

console.log('🔄 TWO APPROACHES:\n');

console.log('═══════════════════════════════════════════════════════════════');
console.log('OPTION 1: Let it fail first, then grant role (RECOMMENDED)');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('1. Go to https://app.spiritdao.org/executive/donations');
console.log('2. Get 2-of-3 executive approvals on the donation');
console.log('3. Minting will be triggered automatically');
console.log('4. Check server logs/console - it will show an error like:');
console.log('   "AccessControl: account 0x1234... is missing role EXECUTIVE_ROLE"');
console.log('5. Copy that wallet address');
console.log('6. Use Option 2 below to grant the role to that address\n');

console.log('═══════════════════════════════════════════════════════════════');
console.log('OPTION 2: Grant role using Remix (AFTER you have the address)');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('📝 CONTRACT INFO:');
console.log('   SystemToken Contract: 0x98c5F412646ea0078f9C3bA82d139b6a00000000 (REPLACE WITH ACTUAL)');
console.log('   Network: Base Mainnet (Chain ID: 8453)');
console.log('   Explorer: https://basescan.org\n');

console.log('🔑 EXECUTIVE_ROLE Hash:');
const executiveRoleHash = '0x' + Buffer.from('EXECUTIVE_ROLE').toString('hex');
console.log(`   Raw: ${executiveRoleHash}`);
console.log('   Keccak256: 0x...(will be calculated by contract)\n');

console.log('📋 STEPS TO GRANT ROLE IN REMIX:\n');

console.log('1. Open Remix: https://remix.ethereum.org/');
console.log('2. Load SystemToken.sol from your contracts folder');
console.log('3. Compile the contract');
console.log('4. Deploy & Run → Environment: "Injected Provider - MetaMask"');
console.log('5. Connect your Executive Pod wallet in MetaMask');
console.log('6. "At Address" → Enter SystemToken contract address');
console.log('7. Find the "grantRole" function');
console.log('8. Call grantRole with:');
console.log('   - role: Call EXECUTIVE_ROLE() getter first to get the bytes32 hash');
console.log('   - account: The minting wallet address from the error log\n');

console.log('═══════════════════════════════════════════════════════════════');
console.log('OPTION 3: Use a script to grant role (Need private key with DEFAULT_ADMIN_ROLE)');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('⚠️  This requires a wallet that has DEFAULT_ADMIN_ROLE on SystemToken');
console.log('   (Usually the contract deployer or Executive Pod multisig)\n');

console.log('If you have the private key, I can create a script to grant the role.');
console.log('Otherwise, use Option 1 (recommended) or Option 2.\n');

console.log('═══════════════════════════════════════════════════════════════');
console.log('WHAT TO DO NOW:');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('✅ RECOMMENDED PATH:');
console.log('1. Go to https://app.spiritdao.org/executive/donations');
console.log('2. Approve the donation with 2 executive wallets');
console.log('3. Check Vercel function logs for the minting error');
console.log('4. Look for a line like: "Minting wallet address: 0x..."');
console.log('5. Come back and tell me the wallet address');
console.log('6. I\'ll help you grant the role to that address\n');

console.log('═══════════════════════════════════════════════════════════════\n');
