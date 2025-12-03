// src/features/shopping-cart/components/SizeSelectionModal/SizeSelectionModal.tsx
'use client';

import type React from 'react';
import { useState } from 'react';
import styled from 'styled-components';
import type { IProduct } from '../../models';

interface SizeSelectionModalProps {
  product: IProduct;
  isOpen: boolean;
  onSizeSelect: (size: string) => void;
  onClose: () => void;
}

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 12px;
  max-width: 400px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  position: relative;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #666;
  
  &:hover {
    color: #000;
  }
`;

const Title = styled.h2`
  margin: 0 0 1rem 0;
  color: #333;
  font-size: 1.25rem;
`;

const ProductInfo = styled.div`
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #eee;
`;

const ProductName = styled.h3`
  margin: 0 0 0.5rem 0;
  color: #555;
  font-size: 1rem;
`;

const ProductPrice = styled.p`
  margin: 0;
  color: #666;
  font-size: 0.875rem;
`;

const SizeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.5rem;
`;

const SizeOption = styled.button<{ selected: boolean }>`
  padding: 0.75rem;
  border: 2px solid ${(props) => (props.selected ? '#007bff' : '#ddd')};
  background: ${(props) => (props.selected ? '#007bff' : 'white')};
  color: ${(props) => (props.selected ? 'white' : '#333')};
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s ease;
  
  &:hover {
    border-color: #007bff;
    transform: translateY(-1px);
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
`;

const CancelButton = styled.button`
  padding: 0.75rem 1.5rem;
  border: 1px solid #ddd;
  background: white;
  color: #666;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  
  &:hover {
    background: #f8f9fa;
  }
`;

const AddToCartButton = styled.button`
  padding: 0.75rem 1.5rem;
  border: none;
  background: #007bff;
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  
  &:hover {
    background: #0056b3;
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const SizeSelectionModal: React.FC<SizeSelectionModalProps> = ({
  product,
  isOpen,
  onSizeSelect,
  onClose,
}) => {
  const [selectedSize, setSelectedSize] = useState<string>('');

  if (!isOpen) return null;

  const availableSizes =
    product.available_sizes || product.availableSizes || [];

  const handleSizeClick = (size: string) => {
    setSelectedSize(size);
  };

  const handleAddToCart = () => {
    if (selectedSize) {
      onSizeSelect(selectedSize);
    }
  };

  const handleClose = () => {
    setSelectedSize('');
    onClose();
  };

  const formatPrice = (price: number, currency: string) => {
    return `${price.toFixed(4)} ${currency}`;
  };

  return (
    <ModalOverlay onClick={handleClose}>
      <ModalContent onClick={(e) => e.stopPropagation()}>
        <CloseButton onClick={handleClose}>&times;</CloseButton>

        <Title>Select Size</Title>

        <ProductInfo>
          <ProductName>{product.title || product.name}</ProductName>
          <ProductPrice>
            {(product.price_system || 0) > 0 &&
              formatPrice(product.price_system!, '$SYSTEM')}
            {(product.price_system || 0) > 0 && (product.price_self || 0) > 0 && ' • '}
            {(product.price_self || 0) > 0 && formatPrice(product.price_self!, '$SELF')}
          </ProductPrice>
        </ProductInfo>

        <SizeGrid>
          {availableSizes.map((size) => (
            <SizeOption
              key={size}
              selected={selectedSize === size}
              onClick={() => handleSizeClick(size)}
            >
              {size}
            </SizeOption>
          ))}
        </SizeGrid>

        <ButtonGroup>
          <CancelButton onClick={handleClose}>Cancel</CancelButton>
          <AddToCartButton onClick={handleAddToCart} disabled={!selectedSize}>
            Add to Cart
          </AddToCartButton>
        </ButtonGroup>
      </ModalContent>
    </ModalOverlay>
  );
};

export default SizeSelectionModal;
