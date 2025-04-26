// src/features/shopping-cart/components/Products/Product/style.ts
import styled from "styled-components";

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
  max-width: 150px;
  max-height: 150px;
  object-fit: cover;
  border-radius: 4px;
`;

export const ProductName = styled.div`
  font-size: 1rem;
  font-weight: bold;
  margin-bottom: 0.25rem;
`;

export const ProductDescription = styled.div`
  font-size: 0.9rem;
  color: #333;
  margin-top: 0.25rem;
`;

export const ProductPrice = styled.div`
  font-size: 0.9rem;
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`;

export const AddButton = styled.button`
  background-color: ${({ disabled }) => (disabled ? "#ccc" : "#bfe7c6")};
  color: #000;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  font-size: 0.9rem;
`;
