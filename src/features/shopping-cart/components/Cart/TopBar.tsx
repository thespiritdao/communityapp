// src/components/TopBar.tsx
"use client";

import React from "react";
import Image from "next/image";
import * as S from "./TopBar.style";
import { useCart } from "src/features/shopping-cart/contexts/cart-context"; // Ensure default export
import { useTokenBalances } from "src/context/TokenBalancesContext";

interface TopBarProps {
  address: string;
  tokenBalances: {
    systemBalance: string;
    selfBalance: string;
    hasProofOfCuriosity: boolean;
    hasMarketAdmin: boolean;
  };
}

const TopBar = ({ address }: TopBarProps) => {
  const { balances } = useTokenBalances();
  const { isOpen, openCart, closeCart, products } = useCart();


  const handleCartToggle = () => {
    if (isOpen) {
      closeCart();
    } else {
      openCart();
    }
  };

  return (
    <S.TopBarContainer>
      <S.LeftSection>
        <S.SystemBalances>
          <span>$SYSTEM: {balances?.systemBalance || "0"}</span>
        </S.SystemBalances>
        <S.SelfBalances>
          <span>$SELF: {balances?.selfBalance || "0"}</span>
        </S.SelfBalances>
      </S.LeftSection>
      <S.CartToggleButton onClick={handleCartToggle}>
        <Image
          src="/images/cart/cart-icon.png"
          alt="Cart"
          width={40}
          height={40}
        />
        {/* Show badge if there are items in the cart */}
        {products.length > 0 && (
          <S.CartBadge>{products.length}</S.CartBadge>
        )}
      </S.CartToggleButton>
    </S.TopBarContainer>
  );
};

export default TopBar;
