// src/features/shopping-cart/utils/tokenConfig.ts
import type { Token } from '../hooks/useCartCalculations';

const BASE_CHAIN_ID = 8453;

/**
 * Default token options for the marketplace cart
 * CRITICAL: These must match the exact configuration from Cart.tsx
 */
export const DEFAULT_TOKEN_OPTIONS: Token[] = [
  {
    name: '$SYSTEM',
    address: process.env.NEXT_PUBLIC_SYSTEM_TOKEN as string,
    symbol: '$SYSTEM',
    decimals: 18,
    image: '/images/erc20tokens/SystemToken.png',
    chainId: BASE_CHAIN_ID,
  },
  {
    name: '$SELF',
    // Soulbound ERC-1155 SelfEpochs (not the retired ERC-20). Used here as the
    // token identifier for selection/display; $SELF is spent via burn-to-pay
    // (SELF_PAYMENT) and its balance is the decay-aware value from
    // /api/self/holdings, never a plain balanceOf on this address.
    address: process.env.NEXT_PUBLIC_SELF_EPOCHS as string,
    symbol: '$SELF',
    decimals: 18,
    image: '/images/erc20tokens/SelfToken.png',
    chainId: BASE_CHAIN_ID,
  },
];

/**
 * Get the default selected token (first option - $SYSTEM)
 */
export const getDefaultToken = (): Token => DEFAULT_TOKEN_OPTIONS[0];

/**
 * Find a token by symbol
 */
export const findTokenBySymbol = (symbol: string): Token | undefined => {
  return DEFAULT_TOKEN_OPTIONS.find((token) => token.symbol === symbol);
};

/**
 * Validate token configuration
 */
export const validateTokenConfig = (): {
  isValid: boolean;
  issues: string[];
} => {
  const issues: string[] = [];

  if (!process.env.NEXT_PUBLIC_SYSTEM_TOKEN) {
    issues.push('NEXT_PUBLIC_SYSTEM_TOKEN not configured');
  }

  if (!process.env.NEXT_PUBLIC_SELF_TOKEN) {
    issues.push('NEXT_PUBLIC_SELF_TOKEN not configured');
  }

  DEFAULT_TOKEN_OPTIONS.forEach((token, index) => {
    if (!token.address) {
      issues.push(`Token ${index} (${token.symbol}) missing address`);
    }
    if (!token.image) {
      issues.push(`Token ${index} (${token.symbol}) missing image`);
    }
  });

  return {
    isValid: issues.length === 0,
    issues,
  };
};
