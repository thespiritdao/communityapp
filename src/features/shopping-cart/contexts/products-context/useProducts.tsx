// src/features/shopping-cart/contexts/products-context/useProducts.tsx

import { useCallback, useEffect } from "react";
import { useProductsContext } from "./ProductsContextProvider";
import { IProduct } from "models";
import { createClient } from "@supabase/supabase-js";
import { useTokenBalances } from "src/context/TokenBalancesContext";

// Supabase setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const useProducts = () => {
  const {
    isFetching,
    setIsFetching,
    products,
    setProducts,
    filters,
    setFilters,
  } = useProductsContext();
  
  // Use the centralized token balances context
  const { balances: userTokens } = useTokenBalances();

  // Token mapping function to check if user has required token
  const hasRequiredToken = useCallback((requiredTokenId: string | null): boolean => {
    if (!requiredTokenId || !userTokens) return true; // No token required or no balances loaded

    // Map database token IDs to token balance properties
    switch (requiredTokenId) {
      case 'exec': // Executive Pod token
        return userTokens.hasExecutivePod;
      case 'dev': // Dev Pod token  
        return userTokens.hasDevPod;
      case 'bounty': // Bounty Hat token
        return userTokens.hasBountyHat;
      case 'curiosity': // Proof of Curiosity token
        return userTokens.hasProofOfCuriosity;
      case 'market_admin': // Market Admin token (maps to Market Management)
        return userTokens.hasMarketAdmin;
      case 'self': // Self token
        return Number(userTokens.selfBalance) > 0;
      case 'system': // System token
        return Number(userTokens.systemBalance) > 0;
      default:
        // Fallback to environment variable mapping for legacy tokens
        if (requiredTokenId === process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY) {
          return userTokens.hasProofOfCuriosity;
        }
        if (requiredTokenId === process.env.NEXT_PUBLIC_SELF_TOKEN) {
          return Number(userTokens.selfBalance) > 0;
        }
        if (requiredTokenId === process.env.NEXT_PUBLIC_SYSTEM_TOKEN) {
          return Number(userTokens.systemBalance) > 0;
        }
        if (requiredTokenId === process.env.NEXT_PUBLIC_MARKET_MANAGEMENT) {
          return userTokens.hasMarketManagement;
        }
        return false;
    }
  }, [userTokens]);

  // Fetch products from Supabase and apply token gating.
  const fetchProducts = useCallback(async () => {
    setIsFetching(true);
    const { data, error } = await supabase.from("products").select("*");
    if (error) {
      console.error("❌ Error fetching products:", error);
      setIsFetching(false);
      return;
    }

    // Filter products based on token gating using the new mapping function
    const filteredProducts = data.filter((product: IProduct) => {
      return hasRequiredToken(product.required_token);
    });

    setProducts(filteredProducts);
    setIsFetching(false);
  }, [setIsFetching, setProducts, hasRequiredToken]);

  // Filter products by available sizes, token gating, and sorting.
  const filterProducts = useCallback(async (
    selectedFilters: string[] = [], 
    sortOption: string = "", 
    tokenFilter: string = ""
  ) => {
    setIsFetching(true);
    const { data, error } = await supabase.from("products").select("*");
    if (error) {
      console.error("❌ Error fetching products:", error);
      setIsFetching(false);
      return;
    }

    let filteredProducts = data;
    
    // Apply size filters
    if (selectedFilters.length > 0) {
      filteredProducts = filteredProducts.filter((p: IProduct) =>
        selectedFilters.some((filter: string) => p.availableSizes.includes(filter))
      );
    }

    // Apply token filtering if specified
    if (tokenFilter) {
      if (tokenFilter === "no_token") {
        // Show only products with no token requirement
        filteredProducts = filteredProducts.filter((p: IProduct) => !p.required_token);
      } else {
        // Show only products that require the specified token
        filteredProducts = filteredProducts.filter((p: IProduct) => p.required_token === tokenFilter);
      }
    }

    // Apply token gating to filtered products using the new mapping function
    let finalProducts = filteredProducts.filter((product: IProduct) => {
      return hasRequiredToken(product.required_token);
    });

    // Apply sorting
    if (sortOption) {
      switch (sortOption) {
        case "priceLowHigh":
          finalProducts.sort((a, b) => {
            const priceA = Math.min(a.price_self || Infinity, a.price_system || Infinity);
            const priceB = Math.min(b.price_self || Infinity, b.price_system || Infinity);
            return priceA - priceB;
          });
          break;
        case "priceHighLow":
          finalProducts.sort((a, b) => {
            const priceA = Math.max(a.price_self || 0, a.price_system || 0);
            const priceB = Math.max(b.price_self || 0, b.price_system || 0);
            return priceB - priceA;
          });
          break;
        case "token":
          // Sort by token requirements - group products by their required token
          finalProducts.sort((a, b) => {
            const tokenA = a.required_token || "no_token";
            const tokenB = b.required_token || "no_token";
            return tokenA.localeCompare(tokenB);
          });
          break;
      }
    }

    setFilters(selectedFilters);
    setProducts(finalProducts);
    setIsFetching(false);
  }, [setIsFetching, setProducts, setFilters, hasRequiredToken]);

  return {
    isFetching,
    fetchProducts,
    products,
    filterProducts,
    filters,
  };
};

export default useProducts;
