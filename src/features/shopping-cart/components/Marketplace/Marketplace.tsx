// src/features/shopping-cart/components/Marketplace/Marketplace.tsx
'use client';

import { useEffect } from 'react';
import Filter from '@/features/shopping-cart/components/Filter/Filter';
import Products from '@/features/shopping-cart/components/Products/Products';
import Cart from '@/features/shopping-cart/components/Cart';
import { useProducts } from '@/features/shopping-cart/contexts/products-context';
import { ConnectWallet } from '@/wallet/components/ConnectWallet';
import { useCDPStatus } from '@/hooks/useCDPStatus';
import * as S from './styles';
import TopBar from '@/features/shopping-cart/components/Cart/TopBar';
import useCart from '@/features/shopping-cart/contexts/cart-context/useCart';
import OrderManagementBar from '@/features/shopping-cart/components/OrderManagementBar/OrderManagementBar';
import { Loader2 } from 'lucide-react';

export default function Marketplace() {
  const { isFetching, products, fetchProducts, totalProductCount } =
    useProducts();
  const { address, isConnected, isInitializing } = useCDPStatus();
  // Retrieve cart open state from your cart context
  const { isOpen } = useCart();

  // Fetch products once when the component mounts.
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Show loading while CDP wallet initializes
  if (isInitializing) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Connecting wallet...</span>
      </div>
    );
  }

  // If not logged in, show the ConnectWallet component.
  if (!isConnected) return <ConnectWallet />;

  return (
    <S.Container>
      {/* TopBar now uses the centralized context for token balances */}
      <TopBar address={address} />

      {/* Order Management Bar - accessible to all users */}
      <OrderManagementBar address={address} />

      <S.Header>
        <Filter />
      </S.Header>

      <S.MainContent>
        <S.MainHeader>
          <p>
            {totalProductCount || 0} Artifact(s) found - {products?.length || 0}{' '}
            Accessible
          </p>
        </S.MainHeader>
        <Products products={products} />
      </S.MainContent>

      {/* Render the Cart only if it's explicitly opened */}
      {isOpen && <Cart />}
    </S.Container>
  );
}
