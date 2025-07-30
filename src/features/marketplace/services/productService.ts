// src/features/marketplace/services/productService.ts
import { supabase } from "src/lib/supabase";
import { IProduct } from "src/features/shopping-cart/models";

export interface Token {
  id: string;
  name: string;
  address: string;
  symbol: string;
  image_url?: string;
}

export interface ProductFormData {
  title: string;
  description: string;
  price_self: number;
  price_system: number;
  quantity: number;
  units_available: number;
  image_url: string;
  is_free_shipping: boolean;
  required_token?: string; // Token ID from tokens table
  availableSizes: string[];
  style?: string;
  sku?: number;
}

// Fetch available tokens for product gating
export const fetchTokens = async (): Promise<Token[]> => {
  try {
    const { data, error } = await supabase
      .from('tokens')
      .select('*')
      .order('name', { ascending: true });
    
    if (error) {
      console.error('Error fetching tokens:', error);
      throw error;
    }
    
    return data || [];
  } catch (error) {
    console.error('Failed to fetch tokens:', error);
    throw error;
  }
};

// Create a new product
export const createProduct = async (
  productData: ProductFormData,
  ownerAddress: string
): Promise<IProduct> => {
  try {
    // First check if we have an active session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('Session error:', sessionError);
      throw new Error('Failed to verify authentication session');
    }

    if (!sessionData?.session?.user) {
      console.warn('No active Supabase session found. Attempting to authenticate...');
      
      // If no session, try to authenticate using wallet address
      try {
        const authResponse = await fetch('/api/auth/onchainkit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            address: ownerAddress,
          }),
        });

        if (!authResponse.ok) {
          throw new Error(`Authentication failed: ${authResponse.status}`);
        }

        const authData = await authResponse.json();
        
        if (authData.supabaseToken && authData.supabaseRefreshToken) {
          console.log('Setting Supabase session with tokens...');
          const { data: newSession, error: setSessionError } = await supabase.auth.setSession({
            access_token: authData.supabaseToken,
            refresh_token: authData.supabaseRefreshToken,
          });

          if (setSessionError) {
            console.error('Failed to set session:', setSessionError);
            throw new Error('Failed to establish authentication session');
          }

          console.log('Authentication session established for user:', newSession.session?.user?.id);
        } else {
          throw new Error('No authentication tokens received');
        }
      } catch (authError) {
        console.error('Authentication process failed:', authError);
        throw new Error('Authentication required to create products. Please ensure your wallet is connected.');
      }
    }

    // Now get the authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user?.id) {
      console.error('User verification failed:', userError);
      throw new Error('User authentication verification failed');
    }

    console.log('Creating product for authenticated user:', user.id);

    const { data, error } = await supabase
      .from('products')
      .insert({
        name: productData.title, // Add the required 'name' field
        title: productData.title,
        description: productData.description,
        price_self: productData.price_self,
        price_system: productData.price_system,
        quantity: productData.quantity,
        units_available: productData.units_available,
        image_url: productData.image_url,
        is_free_shipping: productData.is_free_shipping,
        required_token: productData.required_token || null,
        available_sizes: productData.availableSizes,
        owner_id: user.id, // Use the authenticated user's UUID
        style: productData.style || 'default',
        sku: productData.sku || Math.floor(Math.random() * 100000),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating product:', error);
      throw error;
    }

    console.log('Product created successfully:', data);
    return data;
  } catch (error) {
    console.error('Failed to create product:', error);
    throw error;
  }
};

// Update an existing product
export const updateProduct = async (
  productId: string,
  productData: Partial<ProductFormData>
): Promise<IProduct> => {
  try {
    const { data, error } = await supabase
      .from('products')
      .update(productData)
      .eq('id', productId)
      .select()
      .single();

    if (error) {
      console.error('Error updating product:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Failed to update product:', error);
    throw error;
  }
};

// Delete a product
export const deleteProduct = async (productId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  } catch (error) {
    console.error('Failed to delete product:', error);
    throw error;
  }
};