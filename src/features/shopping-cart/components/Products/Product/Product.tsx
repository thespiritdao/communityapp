// src/features/shopping-cart/components/Products/Product/Product.tsx
"use client";

import React from "react";
import { IProduct } from "models";
import * as S from "./style"; // See style file below.
import { useCart } from "src/features/shopping-cart/contexts/cart-context";

interface ProductProps {
  product: IProduct;
  isAccessible: boolean;
}

const Product = ({ product, isAccessible }: ProductProps) => {

    const { addProduct } = useCart();
	const handleAddToCart = () => {
	  addProduct(product);
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
            Add to Cart
          </S.AddButton>
        ) : (
          <S.AddButton disabled>
            Add to Cart (Token Required)
          </S.AddButton>
        )}
      </div>
    </S.ProductCard>
  );
};

export default Product;
