'use client';

import type { IProduct } from '../../models';
import Product from './Product/Product';
import { useMarketplaceIdentity } from '../../hooks/useMarketplaceIdentity';
import * as S from './style';
import { memo } from 'react';

interface IProps {
  products: IProduct[];
}

// Memoized product component for better performance
const MemoizedProduct = memo(Product);

/**
 * Optimized Products component
 * - Uses unified identity hook (no duplicate fetching)
 * - Memoized product rendering
 * - Products already filtered by useProductsOptimized
 */
const ProductsOptimized = ({ products }: IProps) => {
  // Use the unified identity hook - cached and shared across components
  const { identity, isLoading } = useMarketplaceIdentity();

  // Show loading state only for initial identity load
  if (isLoading) {
    return (
      <S.Container>
        <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
          🛒 Loading marketplace...
        </div>
      </S.Container>
    );
  }

  // Products are already filtered by useProductsOptimized
  // No need to check access again here
  console.log(`🛒 Rendering ${products.length} products (pre-filtered)`);

  return (
    <S.Container>
      {products.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
          {identity
            ? '🛒 No products available with your current permissions'
            : '🔐 Connect your wallet to see available products'}
        </div>
      ) : (
        products.map((p, index) => (
          <MemoizedProduct
            product={p}
            key={p.sku ? `${p.sku}-${index}` : `${p.id}-${index}`}
            isAccessible={true} // All products here are already accessible
          />
        ))
      )}
    </S.Container>
  );
};

export default memo(ProductsOptimized);
