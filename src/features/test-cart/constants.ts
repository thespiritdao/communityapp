import { Product } from './types';

export const PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Base T-Shirt',
    description: 'Official Base Network T-Shirt',
    price: 25,
    image: '/images/tshirt.png'
  },
  {
    id: '2',
    name: 'Base Hoodie',
    description: 'Official Base Network Hoodie',
    price: 45,
    image: '/images/hoodie.png'
  },
  {
    id: '3',
    name: 'Base Cap',
    description: 'Official Base Network Cap',
    price: 15,
    image: '/images/cap.png'
  }
];

export const TOKENS = {
  SELF: process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`,
  SYSTEM: process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`
}; 