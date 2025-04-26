// src/features/shopping-cart/components/Marketplace/Marketplace.tsx
"use client";

import React, { useEffect } from "react";
import Filter from "src/features/shopping-cart/components/Filter/Filter";
import Products from "src/features/shopping-cart/components/Products/Products";
import Cart from "src/features/shopping-cart/components/Cart";
import { useProducts } from "src/features/shopping-cart/contexts/products-context";
import { ConnectWallet } from "src/wallet/components/ConnectWallet";
import { useAccount } from "wagmi";
import * as S from "./styles";
import TopBar from "src/features/shopping-cart/components/Cart/TopBar";
import { useTokenBalances } from "src/context/TokenBalancesContext";
import useCart from "src/features/shopping-cart/contexts/cart-context/useCart";

export default function Marketplace() {
  const { isFetching, products, fetchProducts } = useProducts();
  const { address } = useAccount();
  // Retrieve cart open state from your cart context
  const { isOpen } = useCart();

  // Fetch products once when the component mounts.
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // If not logged in, show the ConnectWallet component.
  if (!address) return <ConnectWallet />;

  return (
    <S.Container>
      {/* TopBar now uses the centralized context for token balances */}
      <TopBar address={address} />
      
      <S.Header>
        <Filter />
      </S.Header>
      
      <S.MainContent>
        <S.MainHeader>
          <p>{products?.length} Artifact(s) found</p>
        </S.MainHeader>
        <Products products={products} />
      </S.MainContent>
      
      {/* Render the Cart only if it’s explicitly opened */}
      {isOpen && <Cart />}
    </S.Container>
  );
}
