"use client";

import { memo, useCallback } from "react";
import styled from "styled-components";
import type { ICartProduct } from "../../../models";
import useCart from "../../../contexts/cart-context/useCart";
import formatPrice from "@/utils/formatPrice";

const ItemContainer = styled.div`
  display: flex;
  padding: 1rem;
  border-bottom: 1px solid #eee;
  align-items: center;
  transition: background-color 0.2s ease;
  
  &:hover {
    background-color: #f8f9fa;
  }
  
  &:last-child {
    border-bottom: none;
  }
`;

const ItemImage = styled.img`
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 8px;
  margin-right: 1rem;
  background: #f0f0f0;
`;

const ItemDetails = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const ItemName = styled.h4`
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #333;
  line-height: 1.2;
`;

const ItemMeta = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  font-size: 0.75rem;
  color: #666;
`;

const ItemActions = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
`;

const PriceDisplay = styled.div`
  font-weight: 600;
  color: #333;
  font-size: 0.9rem;
`;

const QuantityControls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const QuantityButton = styled.button`
  width: 24px;
  height: 24px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.75rem;
  
  &:hover {
    background: #f0f0f0;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const QuantityDisplay = styled.span`
  min-width: 20px;
  text-align: center;
  font-size: 0.8rem;
  font-weight: 500;
`;

const RemoveButton = styled.button`
  background: none;
  border: none;
  color: #dc3545;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.25rem;
  
  &:hover {
    color: #a71e2a;
  }
`;

interface CartItemProps {
  product: ICartProduct;
}

/**
 * CartItem - Individual cart item component
 * - Memoized to prevent unnecessary re-renders
 * - Optimistic quantity updates
 * - Accessible controls
 */
const CartItem = memo(({ product }: CartItemProps) => {
  const { updateProductQuantity, removeProduct } = useCart();

  const handleIncreaseQuantity = useCallback(() => {
    updateProductQuantity(product.id, (product.quantity || 1) + 1);
  }, [product.id, product.quantity, updateProductQuantity]);

  const handleDecreaseQuantity = useCallback(() => {
    const newQuantity = (product.quantity || 1) - 1;
    if (newQuantity > 0) {
      updateProductQuantity(product.id, newQuantity);
    }
  }, [product.id, product.quantity, updateProductQuantity]);

  const handleRemove = useCallback(() => {
    removeProduct(product.id);
  }, [product.id, removeProduct]);

  const quantity = product.quantity || 1;
  const systemPrice = (product.priceSystem || product.price_system || 0) * quantity;
  const selfPrice = (product.priceSelf || product.price_self || 0) * quantity;

  return (
    <ItemContainer>
      <ItemImage 
        src={product.image || product.image_url || '/images/placeholder-product.jpg'} 
        alt={product.name || product.title}
        onError={(e) => {
          e.currentTarget.src = '/images/placeholder-product.jpg';
        }}
      />
      
      <ItemDetails>
        <ItemName>{product.name || product.title}</ItemName>
        <ItemMeta>
          {product.style && <span>Style: {product.style}</span>}
          {product.requiredToken && (
            <span>Requires: {product.requiredToken}</span>
          )}
          <span>SKU: {product.sku || product.id}</span>
        </ItemMeta>
      </ItemDetails>

      <ItemActions>
        <PriceDisplay>
          {systemPrice > 0 && <div>${formatPrice(systemPrice, "")} SYSTEM</div>}
          {selfPrice > 0 && <div>${formatPrice(selfPrice, "")} SELF</div>}
        </PriceDisplay>

        <QuantityControls>
          <QuantityButton 
            onClick={handleDecreaseQuantity}
            disabled={quantity <= 1}
            aria-label="Decrease quantity"
          >
            −
          </QuantityButton>
          <QuantityDisplay>{quantity}</QuantityDisplay>
          <QuantityButton 
            onClick={handleIncreaseQuantity}
            aria-label="Increase quantity"
          >
            +
          </QuantityButton>
        </QuantityControls>

        <RemoveButton 
          onClick={handleRemove}
          aria-label={`Remove ${product.name || product.title} from cart`}
        >
          Remove
        </RemoveButton>
      </ItemActions>
    </ItemContainer>
  );
});

CartItem.displayName = 'CartItem';

export default CartItem;