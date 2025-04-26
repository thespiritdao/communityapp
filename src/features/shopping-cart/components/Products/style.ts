// src/features/shopping-cart/components/Products/style.ts
import styled from 'styled-components';

export const ProductCard = styled.div`
  border: 1px solid #ddd;
  padding: 1rem;
  border-radius: 8px;
  text-align: center;
  max-width: 250px;
  margin: 1rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
`;

export const ProductImage = styled.img`
  width: 100%;
  height: auto;
  border-radius: 4px;
`;

export const ProductDetails = styled.div`
  margin-top: 0.5rem;
`;

export const ProductName = styled.h3`
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
`;

export const ProductPrice = styled.p`
  font-size: 1rem;
  margin-bottom: 1rem;
`;

export const AddButton = styled.button`
  background-color: ${({ disabled }) => (disabled ? "#ccc" : "#bfe7c6")};
  color: #000;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  font-size: 0.9rem;
`;

export const Container = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
`;
