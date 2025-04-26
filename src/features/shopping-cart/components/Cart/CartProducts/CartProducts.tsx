// src/features/shopping-cart/components/cart/cartproducts/CartProducts.tsx
"use client";

import React from "react";
import { ICartProduct } from "models";
import CartProduct from "./CartProduct/CartProduct";
import * as S from "./style"; // adjust path as needed

interface CartProductsProps {
  products: ICartProduct[];
}

const CartProducts = ({ products }: CartProductsProps) => {
  return (
    <S.Container>
      {products.map((product) => (
        <CartProduct key={product.id || product.sku} product={product} />
      ))}
    </S.Container>
  );
};

export default CartProducts;
