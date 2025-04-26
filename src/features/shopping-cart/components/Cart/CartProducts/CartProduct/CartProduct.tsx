// src/features/shopping-cart/components/cart/cartproducts/CartProduct/CartProduct.tsx
"use client";

import React from "react";
import { ICartProduct } from "models";
import useCart from "src/features/shopping-cart/contexts/cart-context/useCart";

import * as S from "./style"; // adjust path as needed

interface CartProductProps {
  product: ICartProduct;
}

const CartProduct = ({ product }: CartProductProps) => {
  const { removeProduct, increaseProductQuantity, decreaseProductQuantity } = useCart();

  const handleRemove = () => removeProduct(product);


  return (
    <S.ProductContainer>
      <S.ProductImage src={product.image_url} alt={product.name} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <S.ProductName>{product.name}</S.ProductName>
        <div>
          <S.QuantityButton onClick={() => decreaseProductQuantity(product)}>
            -
          </S.QuantityButton>
          <span style={{ margin: "0 8px" }}>{product.quantity}</span>
          <S.QuantityButton onClick={() => increaseProductQuantity(product)}>
            +
          </S.QuantityButton>
          <S.RemoveButton onClick={() => removeProduct(product)}>
            Remove
          </S.RemoveButton>
        </div>
      </div>
    </S.ProductContainer>
  );
}

export default CartProduct;
