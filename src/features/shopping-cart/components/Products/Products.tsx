// src/features/shopping-cart/components/Products/Products.tsx
'use client';

import type { IProduct } from '../../models';
import Product from './Product/Product'; // Ensure this file exports a default component.
import { useEffect, useState } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useTokenBalances } from '@/context/TokenBalancesContext';
import { getUserIdentity, type UserIdentity } from '@/utils/accessControlUtils';
import * as S from './style';

interface IProps {
  products: IProduct[];
}

const Products = ({ products }: IProps) => {
  const { evmAddress: address } = useEvmAddress();
  const { balances: tokenBalances, isLoading: tokenLoading } =
    useTokenBalances();
  const [userIdentity, setUserIdentity] = useState<UserIdentity | null>(null);
  const [isLoadingIdentity, setIsLoadingIdentity] = useState(true);

  useEffect(() => {
    const loadUserIdentity = async () => {
      if (!address || !tokenBalances || tokenLoading) {
        setUserIdentity(null);
        setIsLoadingIdentity(false);
        return;
      }

      setIsLoadingIdentity(true);
      try {
        const identity = await getUserIdentity(address, tokenBalances);
        setUserIdentity(identity);
        console.log('🛒 Products loaded user identity:', identity);
      } catch (error) {
        console.error('🛒 Error loading user identity in Products:', error);
        setUserIdentity(null);
      } finally {
        setIsLoadingIdentity(false);
      }
    };

    loadUserIdentity();
  }, [address, tokenBalances, tokenLoading]);

  // Show loading state while identity is loading
  if (isLoadingIdentity || tokenLoading) {
    return (
      <S.Container>
        <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
          🛒 Loading products...
        </div>
      </S.Container>
    );
  }

  // Products are already filtered by useProducts hook using async access control
  // No need to filter again here as it would use sync version and incorrectly filter pod_ tokens
  const accessibleProducts = products || [];

  console.log(
    `🛒 Rendering ${accessibleProducts.length} accessible products out of ${products?.length || 0} total`,
  );

  return (
    <S.Container>
      {accessibleProducts.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
          {userIdentity
            ? '🛒 No products available with your current permissions'
            : '🔐 Connect your wallet to see available products'}
        </div>
      ) : (
        accessibleProducts.map((p, index) => (
          <Product
            product={p}
            key={p.sku ? `${p.sku}-${index}` : index.toString()}
            isAccessible={true} // Already filtered, so all remaining products are accessible
          />
        ))
      )}
    </S.Container>
  );
};

export default Products;
