// src/components/TopBar.tsx
'use client';
import Image from 'next/image';
import * as S from './TopBar.style';
import { useCart } from '@/features/shopping-cart/contexts/cart-context'; // Ensure default export
import { useTokenBalances } from '@/context/TokenBalancesContext';
import ManageProductsButton from '@/features/marketplace/components/ManageProductsButton';

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
          <span className="label">$SYSTEM:</span>
          <span className="value">
            {Number.parseFloat(balances?.systemBalance || '0').toFixed(4)}
          </span>
        </S.SystemBalances>
        <S.SelfBalances>
          <span className="label">$SELF:</span>
          <span className="value">
            {Number.parseFloat(balances?.selfBalance || '0').toFixed(4)}
          </span>
        </S.SelfBalances>
      </S.LeftSection>

      <S.RightSection>
        <ManageProductsButton />
        <S.CartToggleButton onClick={handleCartToggle}>
          <Image
            src="/images/cart/cart-icon.png"
            alt="Cart"
            width={40}
            height={40}
          />
          {/* Show badge if there are items in the cart */}
          {products.length > 0 && <S.CartBadge>{products.length}</S.CartBadge>}
        </S.CartToggleButton>
      </S.RightSection>
    </S.TopBarContainer>
  );
};

export default TopBar;
