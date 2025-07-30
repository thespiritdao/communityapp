console.log('🔍 Environment Variable Check:');
console.log('NEXT_PUBLIC_PURCHASE_BURN:', process.env.NEXT_PUBLIC_PURCHASE_BURN);
console.log('Length:', process.env.NEXT_PUBLIC_PURCHASE_BURN?.length);
console.log('Starts with 0x:', process.env.NEXT_PUBLIC_PURCHASE_BURN?.startsWith('0x'));
console.log('Is correct address:', process.env.NEXT_PUBLIC_PURCHASE_BURN === '0x5CaD68445feAb8d96a8535B60CC3758B3139B3F7');

// Function selector for purchaseArtifact(uint256,uint256,string)
const crypto = require('crypto');
function keccak256(data) {
    return crypto.createHash('sha3-256').update(data).digest('hex');
}
const functionSignature = 'purchaseArtifact(uint256,uint256,string)';
const selector = '0x' + keccak256(functionSignature).slice(0, 8);
console.log('\n🎯 Function Selector for Paymaster Whitelist:');
console.log('Function:', functionSignature);
console.log('Selector:', selector); 