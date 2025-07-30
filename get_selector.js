const crypto = require('crypto');

function keccak256(data) {
    return crypto.createHash('sha3-256').update(data).digest('hex');
}

const functionSignature = 'purchaseArtifact(uint256,uint256,string)';
const hash = keccak256(functionSignature);
const selector = '0x' + hash.slice(0, 8);

console.log('Function signature:', functionSignature);
console.log('Keccak256 hash:', hash);
console.log('Function selector:', selector); 