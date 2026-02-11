import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const address = '0xE9be6A5413e29c59c896eedc71dF10E282FB0318';

const client = createPublicClient({
  chain: base,
  transport: http()
});

console.log('═══════════════════════════════════════════════════════════');
console.log('🔍 VERIFYING SYSTEMTOKENV2 DEPLOYMENT');
console.log('═══════════════════════════════════════════════════════════');
console.log('Address:', address);
console.log('Network: Base Mainnet\n');

const code = await client.getBytecode({ address });

if (!code || code === '0x') {
  console.log('❌ No contract found at this address');
  process.exit(1);
}

console.log('✅ Contract exists on Base mainnet!\n');

const abi = [
  { inputs: [], name: 'hatsProtocol', outputs: [{ type: 'address' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'executiveHatId', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'name', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' },
  { inputs: [], name: 'symbol', outputs: [{ type: 'string' }], stateMutability: 'view', type: 'function' }
];

try {
  const [name, symbol, hatsProtocol, hatId] = await Promise.all([
    client.readContract({ address, abi, functionName: 'name' }),
    client.readContract({ address, abi, functionName: 'symbol' }),
    client.readContract({ address, abi, functionName: 'hatsProtocol' }),
    client.readContract({ address, abi, functionName: 'executiveHatId' })
  ]);

  console.log('📋 Contract Configuration:');
  console.log('   Name:', name);
  console.log('   Symbol:', symbol);
  console.log('   Hats Protocol:', hatsProtocol);
  console.log('   Executive Hat ID:', hatId);
  console.log('');

  const expectedHats = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
  const expectedHatId = '0x0000008800010000000000000000000000000000000000000000000000000000';

  if (hatsProtocol.toLowerCase() === expectedHats.toLowerCase() && hatId === expectedHatId) {
    console.log('✅ All configuration is CORRECT!');
  } else {
    console.log('⚠️  Configuration differs from expected values');
    if (hatsProtocol.toLowerCase() !== expectedHats.toLowerCase()) {
      console.log('   Expected Hats:', expectedHats);
      console.log('   Got:', hatsProtocol);
    }
    if (hatId !== expectedHatId) {
      console.log('   Expected Hat ID:', expectedHatId);
      console.log('   Got:', hatId);
    }
  }

} catch (error) {
  console.log('⚠️  Could not read contract:', error.message);
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('✅ DEPLOYMENT VERIFIED - Ready for next steps!');
console.log('═══════════════════════════════════════════════════════════');
console.log('\n📋 NEXT STEPS:\n');
console.log('1. Add to CDP Paymaster whitelist:');
console.log('   Contract: 0xE9be6A5413e29c59c896eedc71dF10E282FB0318');
console.log('   Function: mint(address,uint256)\n');
console.log('2. Update .env.local:');
console.log('   NEXT_PUBLIC_SYSTEM_TOKEN=0xE9be6A5413e29c59c896eedc71dF10E282FB0318\n');
console.log('3. Test donation minting on /executive/donations\n');
