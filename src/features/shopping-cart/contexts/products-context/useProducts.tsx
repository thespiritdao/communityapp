// src/features/shopping-cart/contexts/products-context/useProducts.tsx

import { useCallback } from 'react';
import { useProductsContext } from './ProductsContextProvider';
import type { IProduct } from '../../models';
import { createClient } from '@supabase/supabase-js';
import { useTokenBalances } from '@/context/TokenBalancesContext';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import {
  getAccessibleProductsForUser,
  sortProducts,
} from '@/features/shopping-cart/services/accessControl';
import { getUserIdentity } from '@/utils/accessControlUtils';

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
    totalProductCount,
    setTotalProductCount,
  } = useProductsContext();

  // Use the centralized token balances context and account
  const { balances: userTokens } = useTokenBalances();
  const { evmAddress: address } = useEvmAddress();

  // Get user identity for access control
  const getUserAccessControl = useCallback(async () => {
    if (!address || !userTokens) return null;

    try {
      return await getUserIdentity(address, userTokens);
    } catch (error) {
      console.error('🛒 Error getting user identity for products:', error);
      return null;
    }
  }, [address, userTokens]);

  // Fetch products from Supabase and apply token gating.
  const fetchProducts = useCallback(async () => {
    setIsFetching(true);

    try {
      const { data, error } = await supabase.from('products').select('*');
      if (error) {
        console.error('🛒 Error fetching products:', error);
        setIsFetching(false);
        return;
      }

      // Always set the total product count
      setTotalProductCount(data.length);

      if (!address || !userTokens) {
        // Return only products with no token requirements if user not authenticated
        const publicProducts = data.filter(
          (product: IProduct) =>
            !product.required_token && !product.requiredToken,
        );
        setProducts(publicProducts);
        setIsFetching(false);
        return;
      }

      // Use the new access control system
      const accessibleProducts = await getAccessibleProductsForUser(
        data,
        address,
        userTokens,
      );

      console.log(
        `🛒 Loaded ${accessibleProducts.length} accessible products out of ${data.length} total`,
      );
      setProducts(accessibleProducts);
    } catch (error) {
      console.error('🛒 Error in fetchProducts:', error);
      setProducts([]);
    } finally {
      setIsFetching(false);
    }
  }, [setIsFetching, setProducts, setTotalProductCount, address, userTokens]);

  // Filter products by available sizes, token gating, and sorting.
  const filterProducts = useCallback(
    async (
      selectedFilters: string[] = [],
      sortOption = '',
      tokenFilter = '',
    ) => {
      setIsFetching(true);

      try {
        const { data, error } = await supabase.from('products').select('*');
        if (error) {
          console.error('🛒 Error fetching products for filtering:', error);
          setIsFetching(false);
          return;
        }

        let filteredProducts = data;

        // Apply size filters
        if (selectedFilters.length > 0) {
          filteredProducts = filteredProducts.filter((p: IProduct) =>
            selectedFilters.some((filter: string) =>
              p.availableSizes.includes(filter),
            ),
          );
        }

        // Apply token filtering if specified
        if (tokenFilter) {
          if (tokenFilter === 'no_token') {
            // Show only products with no token requirement
            filteredProducts = filteredProducts.filter(
              (p: IProduct) => !p.required_token && !p.requiredToken,
            );
          } else {
            // Show only products that require the specified token
            filteredProducts = filteredProducts.filter(
              (p: IProduct) =>
                p.required_token === tokenFilter ||
                p.requiredToken === tokenFilter,
            );
          }
        }

        // Apply access control using the new system
        if (!address || !userTokens) {
          // Return only public products if user not authenticated
          filteredProducts = filteredProducts.filter(
            (p: IProduct) => !p.required_token && !p.requiredToken,
          );
        } else {
          // Get accessible products using the new system
          const accessibleProducts = await getAccessibleProductsForUser(
            filteredProducts,
            address,
            userTokens,
          );
          filteredProducts = accessibleProducts;
        }

        // Apply sorting using the centralized sort function
        const sortedProducts = sortProducts(filteredProducts, sortOption);

        console.log(
          `🛒 Filtered to ${sortedProducts.length} products (filters: ${selectedFilters.join(',') || 'none'}, sort: ${sortOption || 'none'}, token: ${tokenFilter || 'none'})`,
        );

        setFilters(selectedFilters);
        setProducts(sortedProducts);
      } catch (error) {
        console.error('🛒 Error in filterProducts:', error);
        setProducts([]);
      } finally {
        setIsFetching(false);
      }
    },
    [setIsFetching, setProducts, setFilters, address, userTokens],
  );

  return {
    isFetching,
    fetchProducts,
    products,
    filterProducts,
    filters,
    totalProductCount,
  };
};

export default useProducts;
