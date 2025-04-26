// src/features/shopping-cart/contexts/products-context/useProducts.tsx

import { useCallback, useEffect, useState, useRef } from "react";
import { useProductsContext } from "./ProductsContextProvider";
import { IProduct } from "models";
import { createClient } from "@supabase/supabase-js";
import { useAccount } from "wagmi";
import { fetchTokenBalances, TokenBalances } from "src/utils/fetchTokenBalances";

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
  const { address } = useAccount();

  // Initialize token balances as an object.
  const [userTokens, setUserTokens] = useState<TokenBalances>({
    hasProofOfCuriosity: false,
    hasMarketAdmin: false,
    systemBalance: "0",
    selfBalance: "0",
  });

  // Use a ref to avoid re-fetching tokens on every render for the same wallet.
  const prevAddressRef = useRef<string | null>(null);

  useEffect(() => {
    const checkUserTokens = async () => {
      if (address && address !== prevAddressRef.current) {
        try {
          const tokens = await fetchTokenBalances(address);
          setUserTokens(tokens);
          prevAddressRef.current = address;
        } catch (error) {
          console.error("Error fetching token balances:", error);
        }
      }
    };
    checkUserTokens();
  }, [address]);

  // Fetch products from Supabase and apply token gating.
  const fetchProducts = useCallback(async () => {
    setIsFetching(true);
    const { data, error } = await supabase.from("products").select("*");
    if (error) {
      console.error("❌ Error fetching products:", error);
      setIsFetching(false);
      return;
    }

    // Filter products based on token gating.
    // Instead of using tokens.includes(...), we check each required token property.
    const filteredProducts = data.filter((product: IProduct) => {
      if (!product.required_token) return true;
      if (product.required_token === process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY) {
        return userTokens.hasProofOfCuriosity;
      }
      if (product.required_token === process.env.NEXT_PUBLIC_SELF_TOKEN) {
        return Number(userTokens.selfBalance) > 0;
      }
      if (product.required_token === process.env.NEXT_PUBLIC_SYSTEM_TOKEN) {
        return Number(userTokens.systemBalance) > 0;
      }
      if (product.required_token === process.env.NEXT_PUBLIC_MARKET_ADMIN) {
        return userTokens.hasMarketAdmin;
      }
      return false;
    });

    setProducts(filteredProducts);
    setIsFetching(false);
  }, [setIsFetching, setProducts, userTokens]);

  // Filter products by available sizes and token gating.
  const filterProducts = useCallback(async (selectedFilters: string[]) => {
    setIsFetching(true);
    const { data, error } = await supabase.from("products").select("*");
    if (error) {
      console.error("❌ Error fetching products:", error);
      setIsFetching(false);
      return;
    }

    let filteredProducts = data;
    if (selectedFilters.length > 0) {
      filteredProducts = data.filter((p: IProduct) =>
        selectedFilters.some((filter: string) => p.availableSizes.includes(filter))
      );
    }

    const finalProducts = filteredProducts.filter((product: IProduct) => {
      if (!product.required_token) return true;
      if (product.required_token === process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY) {
        return userTokens.hasProofOfCuriosity;
      }
      if (product.required_token === process.env.NEXT_PUBLIC_SELF_TOKEN) {
        return Number(userTokens.selfBalance) > 0;
      }
      if (product.required_token === process.env.NEXT_PUBLIC_SYSTEM_TOKEN) {
        return Number(userTokens.systemBalance) > 0;
      }
      if (product.required_token === process.env.NEXT_PUBLIC_MARKET_ADMIN) {
        return userTokens.hasMarketAdmin;
      }
      return false;
    });

    setFilters(selectedFilters);
    setProducts(finalProducts);
    setIsFetching(false);
  }, [setIsFetching, setProducts, userTokens, setFilters]);

  return {
    isFetching,
    fetchProducts,
    products,
    filterProducts,
    filters,
  };
};

export default useProducts;
