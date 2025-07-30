// src/features/shopping-cart/components/Products/Products.tsx
"use client";

import { IProduct } from "models";
import Product from "./Product/Product"; // Ensure this file exports a default component.
import { useEffect, useState } from "react";
import { fetchTokenBalances, TokenBalances } from "src/utils/fetchTokenBalances";
import { useAccount } from "wagmi";
import * as S from "./style";

interface IProps {
  products: IProduct[];
}

const Products = ({ products }: IProps) => {
  const { address } = useAccount();

  // Our token balances are an object.
  const [ownedTokens, setOwnedTokens] = useState<TokenBalances>({
    hasProofOfCuriosity: false,
    hasMarketAdmin: false,
    hasMarketManagement: false,
    hasExecutivePod: false,
    hasDevPod: false,
    hasBountyHat: false,
    systemBalance: "0",
    selfBalance: "0",
  });

  useEffect(() => {
    const checkTokens = async () => {
      if (address) {
        try {
          const tokens = await fetchTokenBalances(address);
          setOwnedTokens(tokens);
        } catch (error) {
          console.error("Error fetching token balances in Products:", error);
        }
      }
    };

    checkTokens();
  }, [address]);

  // Helper function to decide if a product is accessible.
  const isAccessibleForProduct = (product: IProduct): boolean => {
    if (!product.requiredToken) return true;
    if (product.requiredToken === process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY) {
      return ownedTokens.hasProofOfCuriosity;
    }
    if (product.requiredToken === process.env.NEXT_PUBLIC_SELF_TOKEN) {
      return Number(ownedTokens.selfBalance) > 0;
    }
    if (product.requiredToken === process.env.NEXT_PUBLIC_SYSTEM_TOKEN) {
      return Number(ownedTokens.systemBalance) > 0;
    }
    if (product.requiredToken === process.env.NEXT_PUBLIC_MARKET_MANAGEMENT) {
      return ownedTokens.hasMarketAdmin; // Using backward compatibility property
    }
    return false;
  };

  return (
    <S.Container>
      {products?.map((p, index) => (
        <Product
          product={p}
          key={p.sku ? `${p.sku}-${index}` : index.toString()}
          isAccessible={isAccessibleForProduct(p)}
        />
      ))}
    </S.Container>
  );
};

export default Products;
