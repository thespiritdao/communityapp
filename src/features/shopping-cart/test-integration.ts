// Test file to verify shopping cart integration
import { canUserAccessProduct, filterAccessibleProducts } from './services/accessControl';
import type { IProduct } from './models';
import type { UserIdentity } from '@/utils/accessControlUtils';

// Mock product data
const testProducts: IProduct[] = [
  {
    id: 1,
    sku: 1001,
    title: 'Public T-Shirt',
    description: 'Available to everyone',
    availableSizes: ['M', 'L'],
    style: 'casual',
    price: 25,
    installments: 1,
    currencyId: 'USD',
    currencyFormat: '$',
    isFreeShipping: true,
    required_token: null,
  },
  {
    id: 2,
    sku: 1002,
    title: 'Executive Hoodie',
    description: 'Exclusive for executive pod members',
    availableSizes: ['M', 'L'],
    style: 'executive',
    price: 50,
    installments: 1,
    currencyId: 'USD',
    currencyFormat: '$',
    isFreeShipping: true,
    required_token: 'exec',
  },
  {
    id: 3,
    sku: 1003,
    title: 'Developer Mug',
    description: 'For dev pod members',
    availableSizes: ['One Size'],
    style: 'tech',
    price: 15,
    installments: 1,
    currencyId: 'USD',
    currencyFormat: '$',
    isFreeShipping: false,
    required_token: 'dev',
  }
];

// Mock user identity - no tokens
const guestUser: UserIdentity = {
  address: '0x1234567890123456789012345678901234567890',
  tokens: {
    hasExecutivePod: false,
    hasDevPod: false,
    hasBountyHat: false,
    hasProofOfCuriosity: false,
    hasMarketAdmin: false,
    hasMarketManagement: false,
    hasEventManagement: false,
    systemBalance: '0',
    selfBalance: '0',
  },
  hats: []
};

// Mock user identity - executive member
const execUser: UserIdentity = {
  address: '0x1234567890123456789012345678901234567890',
  tokens: {
    hasExecutivePod: true,
    hasDevPod: false,
    hasBountyHat: false,
    hasProofOfCuriosity: true,
    hasMarketAdmin: false,
    hasMarketManagement: false,
    hasEventManagement: false,
    systemBalance: '100',
    selfBalance: '50',
  },
  hats: ['0x0000000100000000000000000000000000000000000000000000000000000000']
};

// Run tests
console.log('🛒 Shopping Cart Integration Test\n');

console.log('--- Guest User Access Test ---');
const guestAccessibleProducts = filterAccessibleProducts(testProducts, guestUser);
console.log(`Guest can access ${guestAccessibleProducts.length} products:`, 
  guestAccessibleProducts.map(p => p.title));

console.log('\n--- Executive User Access Test ---');
const execAccessibleProducts = filterAccessibleProducts(testProducts, execUser);
console.log(`Executive can access ${execAccessibleProducts.length} products:`, 
  execAccessibleProducts.map(p => p.title));

console.log('\n--- Individual Product Access Tests ---');
testProducts.forEach(product => {
  const guestAccess = canUserAccessProduct(product, guestUser);
  const execAccess = canUserAccessProduct(product, execUser);
  console.log(`${product.title}: Guest(${guestAccess}) Executive(${execAccess})`);
});

console.log('\n🛒 Integration test complete!');