'use client';

import { memo, useMemo } from 'react';
import type { ICartProduct } from '../../../models';
import CartItem from './CartItem';

interface CartItemsProps {
  products: ICartProduct[];
}

/**
 * CartItems - Optimized product list display
 * - Memoized item rendering
 * - Efficient updates
 */
const CartItems = memo(({ products }: CartItemsProps) => {
  // Memoize products to prevent unnecessary re-renders
  const memoizedProducts = useMemo(() => products || [], [products]);

  if (memoizedProducts.length === 0) {
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: '#666',
          background: '#f8f9fa',
          borderRadius: '8px',
          margin: '1rem',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '1rem' }}>🛒</div>
        <h3 style={{ margin: '0 0 0.5rem 0', color: '#333' }}>
          Your cart is empty
        </h3>
        <p style={{ margin: 0, fontSize: '14px' }}>
          Add some products to get started!
        </p>
      </div>
    );
  }

  // Scrollable container for all carts
  return (
    <div style={{ padding: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
      {memoizedProducts.map((product, index) => (
        <CartItem key={`${product.id}-${index}`} product={product} />
      ))}
    </div>
  );
});

CartItems.displayName = 'CartItems';

export default CartItems;
