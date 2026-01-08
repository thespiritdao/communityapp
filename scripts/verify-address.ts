import dotenv from 'dotenv';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config();

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

console.log('========================================');
console.log('WALLET ADDRESS VERIFICATION');
console.log('========================================');
console.log('');
console.log('Faucet wallet address (from PRIVATE_KEY):');
console.log(account.address);
console.log('');
console.log('Expected (from BaseScan):');
console.log('0x4156673cdae173f179358d6951c446de837dc42d');
console.log('');

if (account.address.toLowerCase() === '0x4156673cdae173f179358d6951c446de837dc42d') {
  console.log('✅ ADDRESSES MATCH!');
} else {
  console.log('❌ ADDRESSES DO NOT MATCH!');
  console.log('');
  console.log('YOU SENT ETH TO THE WRONG ADDRESS!');
  console.log('You need to send 0.001 ETH to:', account.address);
}
console.log('========================================');
