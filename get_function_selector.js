// Get function selector for changeHatToggle
const { keccak256, toBytes } = require('viem');

const functionSignature = 'changeHatToggle(uint256,address)';
const hash = keccak256(toBytes(functionSignature));
const selector = hash.slice(0, 10); // First 4 bytes (0x + 8 hex chars)

console.log('Function Signature:', functionSignature);
console.log('Function Selector:', selector);
console.log('\nAdd this to Coinbase paymaster whitelist for HATS contract:');
console.log('Contract:', process.env.NEXT_PUBLIC_HATS_CONTRACT || '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137');
console.log('Function Selector:', selector);
