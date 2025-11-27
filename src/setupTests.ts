import '@testing-library/jest-dom';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock environment variables
process.env.NEXT_PUBLIC_RPC_URL = 'https://mainnet.base.org';
process.env.NEXT_PUBLIC_ELIGIBILITY_MODULE_ADDRESS = '0x1234567890123456789012345678901234567890';
process.env.NEXT_PUBLIC_HATS_ADDRESS = '0x0987654321098765432109876543210987654321';