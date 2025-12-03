// src/features/shopping-cart/components/Products/Product/Product.tsx
'use client';
import { useState } from 'react';
import type { IProduct } from '../../../models';
import * as S from './style'; // See style file below.
import { useCart } from '@/features/shopping-cart/contexts/cart-context';
import SizeSelectionModal from '../../SizeSelectionModal';

interface ProductProps {
  product: IProduct;
  isAccessible: boolean;
}

const Product = ({ product, isAccessible }: ProductProps) => {
  const { addProduct } = useCart();
  const [showSizeModal, setShowSizeModal] = useState(false);

  // Check if product has multiple sizes (excluding "One Size")
  const availableSizes =
    product.available_sizes || product.availableSizes || [];
  const hasMultipleSizes =
    availableSizes.length > 1 ||
    (availableSizes.length === 1 && !availableSizes.includes('One Size'));

  const handleAddToCart = () => {
    if (hasMultipleSizes) {
      setShowSizeModal(true);
    } else {
      // For products with only "One Size" or no size info, add directly
      const productWithSize = {
        ...product,
        selectedSize: availableSizes[0] || 'One Size',
        quantity: 1,
      };
      addProduct(productWithSize);
    }
  };

  const handleSizeSelect = (selectedSize: string) => {
    const productWithSize = {
      ...product,
      selectedSize,
      quantity: 1,
    };
    addProduct(productWithSize);
    setShowSizeModal(false);
  };

  const handleCloseModal = () => {
    setShowSizeModal(false);
  };

  return (
    <S.ProductCard>
      <div>
        <S.ProductImageContainer>
          <S.ProductImage
            src={product.image_url} // using 'image_url' from Supabase.
            alt={product.name}
          />
        </S.ProductImageContainer>

        <S.ProductName>{product.name}</S.ProductName>
        <S.ProductDescription>{product.description}</S.ProductDescription>

        <S.ProductPrice>
          <span>$SYSTEM: {product.price_system}</span>
          <span>$SELF: {product.price_self}</span>
        </S.ProductPrice>
      </div>

      <div>
        {isAccessible ? (
          <S.AddButton onClick={handleAddToCart}>
            {hasMultipleSizes ? 'Select Size' : 'Add to Cart'}
          </S.AddButton>
        ) : (
          <S.AddButton disabled={true}>
            Add to Cart (Token Required)
          </S.AddButton>
        )}
      </div>

      <SizeSelectionModal
        product={product}
        isOpen={showSizeModal}
        onSizeSelect={handleSizeSelect}
        onClose={handleCloseModal}
      />
    </S.ProductCard>
  );
};

export default Product;
