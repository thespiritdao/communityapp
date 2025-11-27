'use client';

import { memo, useMemo } from 'react';
import type { ICartProduct } from '../../../models';
import CartItem from './CartItem';
import { FixedSizeList as List } from 'react-window';

interface CartItemsProps {
  products: ICartProduct[];
}

// Virtual list item renderer
const ItemRenderer = memo(
  ({
    index,
    style,
    data,
  }: {
    index: number;
    style: React.CSSProperties;
    data: ICartProduct[];
  }) => (
    <div style={style}>
      <CartItem product={data[index]} />
    </div>
  ),
);

ItemRenderer.displayName = 'CartItemRenderer';

/**
 * CartItems - Optimized product list display
 * - Virtual scrolling for large carts
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

  // Use virtual scrolling for large carts (>10 items)
  if (memoizedProducts.length > 10) {
    return (
      <div style={{ height: '400px', width: '100%' }}>
        <List
          height={400}
          itemCount={memoizedProducts.length}
          itemSize={100}
          itemData={memoizedProducts}
          overscanCount={5}
        >
          {ItemRenderer}
        </List>
      </div>
    );
  }

  // Regular rendering for small carts
  return (
    <div style={{ padding: '0.5rem' }}>
      {memoizedProducts.map((product, index) => (
        <CartItem key={`${product.id}-${index}`} product={product} />
      ))}
    </div>
  );
});

CartItems.displayName = 'CartItems';

export default CartItems;
