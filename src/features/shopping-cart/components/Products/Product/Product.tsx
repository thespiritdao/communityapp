// src/features/shopping-cart/components/Products/Product/Product.tsx
'use client';
import { useState } from 'react';
import type { IProduct } from '../../../models';
import * as S from './style'; // See style file below.
import { useCart } from '@/features/shopping-cart/contexts/cart-context';
import SizeSelectionModal from '../../SizeSelectionModal';
import ProductDetailModal from './ProductDetailModal';

interface ProductProps {
  product: IProduct;
  isAccessible: boolean;
}

const Product = ({ product, isAccessible }: ProductProps) => {
  const { addProduct } = useCart();
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  // Check if product has multiple sizes (excluding "One Size")
  const availableSizes =
    product.available_sizes || product.availableSizes || [];
  const hasMultipleSizes =
    availableSizes.length > 1 ||
    (availableSizes.length === 1 && !availableSizes.includes('One Size'));

  const handleAddToCart = async () => {
    if (hasMultipleSizes) {
      setShowSizeModal(true);
    } else {
      // For products with only "One Size" or no size info, add directly
      const productWithSize = {
        ...product,
        selectedSize: availableSizes[0] || 'One Size',
        quantity: 1,
      };
      await addProduct(productWithSize);
    }
  };

  const handleSizeSelect = async (selectedSize: string) => {
    const productWithSize = {
      ...product,
      selectedSize,
      quantity: 1,
    };
    await addProduct(productWithSize);
    setShowSizeModal(false);
  };

  const handleCloseModal = () => {
    setShowSizeModal(false);
  };

  return (
    <S.ProductCard>
      <div>
        {/* Image and title open the full detail view; the Add button below
            keeps its own behaviour so adding to the cart stays one click. */}
        <S.ProductImageContainer
          onClick={() => setShowDetail(true)}
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          aria-label={`View details for ${product.name}`}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowDetail(true);
            }
          }}
        >
          <S.ProductImage
            src={product.image_url} // using 'image_url' from Supabase.
            alt={product.name}
          />
        </S.ProductImageContainer>

        <S.ProductName onClick={() => setShowDetail(true)} style={{ cursor: 'pointer' }}>
          {product.name}
        </S.ProductName>
        <S.ProductDescription>{product.description}</S.ProductDescription>
        <button
          type="button"
          onClick={() => setShowDetail(true)}
          style={{
            border: 'none',
            background: 'transparent',
            padding: 0,
            marginTop: '0.25rem',
            color: '#1F453A',
            fontSize: '0.82rem',
            fontWeight: 600,
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          View details
        </button>

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

      <ProductDetailModal
        product={product}
        isOpen={showDetail}
        isAccessible={isAccessible}
        onClose={() => setShowDetail(false)}
        onAddToCart={handleAddToCart}
        addLabel={hasMultipleSizes ? 'Select Size' : 'Add to Cart'}
      />

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
