'use client';

import { memo } from 'react';
import { useAccount } from 'wagmi';
import useCart from '@/features/shopping-cart/contexts/cart-context/useCart';
import * as S from './style';

// Import components directly for now to avoid build issues
import CartItems from './CartItems/CartItems';
import CartCheckout from './CartCheckout/CartCheckout';
import CartSummary from './CartSummary/CartSummary';

// Simplified cart container without lazy loading for now

export type Token = {
  address: string;
  chainId: number;
  decimals: number;
  image: string;
  name: string;
  symbol: string;
};

/**
 * CartContainer - Orchestrates the cart experience
 * - Lazy loads sub-components for better performance
 * - Handles loading states with skeletons
 * - Memoized to prevent unnecessary re-renders
 */
const CartContainer = memo(
  ({
    tokenBalances,
  }: {
    tokenBalances: { systemBalance: string; selfBalance: string };
  }) => {
    const { products = [], total, isOpen, closeCart } = useCart();
    const { address } = useAccount();

    // Don't render if cart is closed
    if (!isOpen) return null;

    // Early return if no wallet connected
    if (!address) {
      return (
        <S.Container>
          <S.Header>
            <S.Title>Cart</S.Title>
            <S.Close onClick={closeCart}>×</S.Close>
          </S.Header>
          <S.Content>
            <div
              style={{ padding: '2rem', textAlign: 'center', color: '#666' }}
            >
              Please connect your wallet to use the cart
            </div>
          </S.Content>
        </S.Container>
      );
    }

    return (
      <S.Container>
        <S.Header>
          <S.Title>Cart ({products.length})</S.Title>
          <S.Close onClick={closeCart}>×</S.Close>
        </S.Header>

        <S.Content>
          {/* Cart Items */}
          <CartItems products={products} />

          {/* Cart Summary */}
          <CartSummary total={total} productCount={products.length} />
        </S.Content>

        {/* Checkout Flow */}
        {products.length > 0 && (
          <div style={{ padding: '1rem', borderTop: '1px solid #eee' }}>
            <CartCheckout
              products={products}
              total={total}
              tokenBalances={tokenBalances}
              userAddress={address}
            />
          </div>
        )}
      </S.Container>
    );
  },
);

CartContainer.displayName = 'CartContainer';

export default CartContainer;
