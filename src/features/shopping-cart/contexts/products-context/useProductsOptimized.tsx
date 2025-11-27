import { useCallback } from "react";
import { useProductsContext } from "./ProductsContextProvider";
import type { IProduct } from "../../models";
import { createClient } from "@supabase/supabase-js";
import { useMarketplaceIdentity } from "../../hooks/useMarketplaceIdentity";
import { filterAccessibleProductsAsync, sortProducts } from "@/features/shopping-cart/services/accessControl";

// Supabase setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Optimized products hook that uses unified identity management
 * - Single identity fetch instead of multiple
 * - Leverages session caching
 * - Reduces redundant permission checks
 */
const useProductsOptimized = () => {
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
  
  // Use the unified identity hook - single source of truth
  const { identity, isLoading: identityLoading } = useMarketplaceIdentity();

  // Fetch products with optimized access control
  const fetchProducts = useCallback(async () => {
    // Don't fetch if identity is still loading
    if (identityLoading) {
      console.log('⏳ Waiting for identity to load before fetching products');
      return;
    }
    
    setIsFetching(true);
    
    try {
      // Fetch all products from database
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error("🛒 Error fetching products:", error);
        setIsFetching(false);
        return;
      }

      // Always set the total product count
      setTotalProductCount(data?.length || 0);

      if (identity) {
        // Use optimized async filtering with cached identity
        const accessibleProducts = await filterAccessibleProductsAsync(data || [], identity);
        
        console.log(`🛒 Loaded ${accessibleProducts.length} accessible products out of ${data?.length || 0} total`);
        setProducts(accessibleProducts);
      } else {
        // User not authenticated - return only public products
        const publicProducts = data?.filter((product: IProduct) => 
          !product.required_token && !product.requiredToken
        ) || [];
        
        console.log(`🛒 Loaded ${publicProducts.length} public products (unauthenticated user)`);
        setProducts(publicProducts);
      }
    } catch (error) {
      console.error("🛒 Error in fetchProducts:", error);
      setProducts([]);
    } finally {
      setIsFetching(false);
    }
  }, [setIsFetching, setProducts, setTotalProductCount, identity, identityLoading]);

  // Optimized filter function
  const filterProducts = useCallback(async (
    selectedFilters: string[] = [], 
    sortOption = "", 
    tokenFilter = ""
  ) => {
    // Don't filter if identity is still loading
    if (identityLoading) {
      console.log('⏳ Waiting for identity to load before filtering products');
      return;
    }
    
    setIsFetching(true);
    
    try {
      // Build query with filters at database level when possible
      let query = supabase.from("products").select("*");
      
      // Apply token filter at database level if specified
      if (tokenFilter) {
        if (tokenFilter === "no_token") {
          query = query.or('required_token.is.null,requiredToken.is.null');
        } else {
          query = query.or(`required_token.eq.${tokenFilter},requiredToken.eq.${tokenFilter}`);
        }
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error("🛒 Error fetching products for filtering:", error);
        setIsFetching(false);
        return;
      }

      let filteredProducts = data || [];
      
      // Apply size filters (still client-side as it's array contains)
      if (selectedFilters.length > 0) {
        filteredProducts = filteredProducts.filter((p: IProduct) =>
          selectedFilters.some((filter: string) => p.availableSizes?.includes(filter))
        );
      }

      // Apply access control with cached identity
      if (identity) {
        filteredProducts = await filterAccessibleProductsAsync(filteredProducts, identity);
      } else {
        filteredProducts = filteredProducts.filter((p: IProduct) => 
          !p.required_token && !p.requiredToken
        );
      }

      // Apply sorting
      const sortedProducts = sortProducts(filteredProducts, sortOption);

      console.log(`🛒 Filtered to ${sortedProducts.length} products`);

      setFilters(selectedFilters);
      setProducts(sortedProducts);
    } catch (error) {
      console.error("🛒 Error in filterProducts:", error);
      setProducts([]);
    } finally {
      setIsFetching(false);
    }
  }, [setIsFetching, setProducts, setFilters, identity, identityLoading]);

  // Quick access check for a single product
  const checkProductAccess = useCallback(async (product: IProduct): Promise<boolean> => {
    if (!identity) return false;
    
    const { canUserAccessProductAsync } = await import('../../services/accessControl');
    return canUserAccessProductAsync(product, identity);
  }, [identity]);

  return {
    isFetching: isFetching || identityLoading, // Include identity loading state
    fetchProducts,
    products,
    filterProducts,
    filters,
    totalProductCount,
    checkProductAccess,
    identity, // Expose identity for components that need it
  };
};

export default useProductsOptimized;