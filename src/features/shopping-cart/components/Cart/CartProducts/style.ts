// src/features/shopping-cart/components/cart/cartproducts/CartProduct/style.ts
import styled from "styled-components";

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  max-height: 400px;
  overflow-y: auto;
  padding: 10px;
`;


export const ProductContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-bottom: 1px solid #eee;
`;

export const ProductName = styled.div`
  flex: 2;
  font-size: 1rem;
  color: #333;
  margin-right: 1rem;
  font-weight: bold;
  margin-bottom: 1rem;
`;

export const ProductControls = styled.div`
  display: flex;
  align-items: center;

  button {
    margin: 0 4px;
    padding: 4px 8px;
    font-size: 0.9rem;
    cursor: pointer;
  }

  span {
    margin: 0 8px;
  }
`;

export const ProductDescription = styled.div`
  flex: 2;
  font-size: .5rem;
  color: #333;
  margin-right: 1rem;
`;
