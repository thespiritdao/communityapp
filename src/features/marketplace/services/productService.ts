// src/features/marketplace/services/productService.ts
import { useAuthContext } from '@/features/identity';
import { supabase } from '@/lib/supabase';
import {
  getUserIdentity,
  getAccessibleProducts,
} from '@/utils/accessControlUtils';
import type { IProduct } from '@/features/shopping-cart/models';

export interface Token {
  id: string;
  name: string;
  address: string;
  symbol?: string; // Optional since tokens table might not have this column
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

export interface FundDestination {
  type: 'wallet' | 'pod_treasury';
  label: string;
  value: string;
  podId?: string;
  treasuryAddress?: string;
  description: string;
}

// Fetch available tokens for product gating (excludes SELF and SYSTEM)
export const fetchTokens = async (): Promise<Token[]> => {
  const { session, isAuthenticated, signIn } = useAuthContext();
  try {
    const { data, error } = await supabase
      .from('tokens')
      .select('*')
      .not('name', 'in', '($SELF,$SYSTEM)')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching tokens:', error);
      throw error;
    }

    console.log(
      'Fetched marketplace tokens (excluding SELF/SYSTEM):',
      data?.length || 0,
    );
    return data || [];
  } catch (error) {
    console.error('Failed to fetch tokens:', error);
    throw error;
  }
};

// Create a new product
export const createProduct = async (
  productData: ProductFormData,
  ownerAddress: string,
  fundDestination?: FundDestination,
  podId?: string,
): Promise<IProduct> => {
  try {
    // First check if we have an active session
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (!isAuthenticated || !sessionError) {
      console.error('Session error:', sessionError);
      throw new Error('Failed to verify authentication session');
    }

    if (!isAuthenticated || !sessionData?.session?.user) {
      console.warn(
        'No active Supabase session found. Attempting to authenticate...',
      );

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
          const { data: newSession, error: setSessionError } =
            await supabase.auth.setSession({
              access_token: authData.supabaseToken,
              refresh_token: authData.supabaseRefreshToken,
            });

          if (setSessionError) {
            console.error('Failed to set session:', setSessionError);
            throw new Error('Failed to establish authentication session');
          }

          console.log(
            'Authentication session established for user:',
            newSession.session?.user?.id,
          );
        } else {
          throw new Error('No authentication tokens received');
        }
      } catch (authError) {
        console.error('Authentication process failed:', authError);
        throw new Error(
          'Authentication required to create products. Please ensure your wallet is connected.',
        );
      }
    }

    // Now get the authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      console.error('User verification failed:', userError);
      throw new Error('User authentication verification failed');
    }

    console.log('Creating product for authenticated user:', user.id);

    // Security check: Only Executive Pod members can create products with no token requirement
    if (!productData.required_token || productData.required_token === '') {
      console.log(
        '🔒 Validating Executive Pod access for no-token-required product...',
      );

      try {
        // Import the token balances fetcher to check executive pod membership
        const { fetchTokenBalances } = await import(
          '@/utils/fetchTokenBalances'
        );
        const userTokenBalances = await fetchTokenBalances(ownerAddress);

        if (!userTokenBalances.hasExecutivePod) {
          throw new Error(
            'Only Executive Pod members can create products with no token requirements. This restriction prevents spam and inappropriate content.',
          );
        }

        console.log(
          '✅ Executive Pod membership verified for no-token product creation',
        );
      } catch (balanceError) {
        console.error(
          'Failed to verify Executive Pod membership:',
          balanceError,
        );
        throw new Error(
          'Unable to verify Executive Pod membership. Only Executive Pod members can create products with no token requirements.',
        );
      }
    }

    // Prepare fund routing data
    const fundRouting = {
      fund_destination_type: fundDestination?.type || 'wallet',
      destination_address:
        fundDestination?.type === 'wallet'
          ? ownerAddress
          : fundDestination?.treasuryAddress || null,
      creator_wallet: ownerAddress,
      pod_id: fundDestination?.podId || null,
    };

    console.log('🎯 Creating product with fund routing:', fundRouting);

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
        owner_id: user.id, // Keep owner_id for RLS policy compliance (pod ownership is via required_token)
        style: productData.style || 'default',
        sku: productData.sku || Math.floor(Math.random() * 100000),
        // Fund routing fields
        fund_destination_type: fundRouting.fund_destination_type,
        destination_address: fundRouting.destination_address,
        creator_wallet: fundRouting.creator_wallet,
        pod_id: fundRouting.pod_id,
        // Pod context - NEW: Track which pod this product was created in
        creating_pod_id: podId || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating product:', error);
      throw error;
    }

    console.log('Product created successfully:', data);

    // DECENTRALIZED: Set product destination in smart contract
    // This now uses the decentralized approach - no admin key needed
    if (fundDestination) {
      setImmediate(async () => {
        try {
          console.log(
            '🎯 DECENTRALIZED: Setting product destination in smart contract...',
          );

          // Check if user can perform this action
          const permissionCheck = await fetch(
            `/api/products/set-destination-decentralized?userAddress=${ownerAddress}&podId=${fundDestination.podId || ''}`,
            {
              method: 'GET',
            },
          );

          if (!permissionCheck.ok) {
            console.error(
              '❌ Permission check failed for decentralized destination setting',
            );
            return;
          }

          const permissionData = await permissionCheck.json();
          console.log('🔍 User permissions:', permissionData.permissions);

          // Validate permissions based on destination type
          if (
            fundDestination.type === 'pod_treasury' &&
            !permissionData.permissions.canSetPodTreasuryDestination
          ) {
            console.error(
              '❌ User lacks permission to set pod treasury destination',
            );
            return;
          }

          // Get transaction data for frontend execution
          const response = await fetch(
            '/api/products/set-destination-decentralized',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                productId: data.id.toString(),
                fundDestinationType: fundDestination.type,
                destinationAddress:
                  fundDestination.type === 'wallet'
                    ? ownerAddress
                    : fundDestination.treasuryAddress,
                podId: fundDestination.podId || null,
                userAddress: ownerAddress,
                // Note: No private key included - user will execute via frontend
              }),
            },
          );

          if (response.ok) {
            const responseData = await response.json();
            if (responseData.requiresUserTransaction) {
              console.log(
                '✅ Product destination transaction data prepared - user needs to execute via frontend',
              );
              console.log('📋 Transaction data:', {
                contractAddress: responseData.contractAddress,
                functionName: responseData.functionName,
                args: responseData.args,
              });
            } else {
              console.log('✅ Product destination set in smart contract');
            }
          } else {
            const errorData = await response.json();
            console.error(
              '❌ Failed to set product destination in smart contract:',
              errorData,
            );
          }
        } catch (contractError) {
          console.error(
            '❌ Error setting product destination in smart contract:',
            contractError,
          );
        }
      });
    }

    return data;
  } catch (error) {
    console.error('Failed to create product:', error);
    throw error;
  }
};

// Update an existing product
export const updateProduct = async (
  productId: string,
  productData: Partial<ProductFormData>,
  fundDestination?: FundDestination,
): Promise<IProduct> => {
  try {
    // Transform camelCase to snake_case for database
    const dbData: any = {};

    if (productData.title !== undefined) dbData.title = productData.title;
    if (productData.title !== undefined) dbData.name = productData.title; // Keep both for compatibility
    if (productData.description !== undefined)
      dbData.description = productData.description;
    if (productData.price_self !== undefined)
      dbData.price_self = productData.price_self;
    if (productData.price_system !== undefined)
      dbData.price_system = productData.price_system;
    if (productData.quantity !== undefined)
      dbData.quantity = productData.quantity;
    if (productData.units_available !== undefined)
      dbData.units_available = productData.units_available;
    if (productData.image_url !== undefined)
      dbData.image_url = productData.image_url;
    if (productData.is_free_shipping !== undefined)
      dbData.is_free_shipping = productData.is_free_shipping;
    if (productData.required_token !== undefined)
      dbData.required_token = productData.required_token;
    if (productData.availableSizes !== undefined)
      dbData.available_sizes = productData.availableSizes; // Convert to snake_case
    if (productData.style !== undefined) dbData.style = productData.style;
    if (productData.sku !== undefined) dbData.sku = productData.sku;

    // Add fund routing data if provided
    if (fundDestination) {
      dbData.fund_destination_type = fundDestination.type;
      if (fundDestination.type === 'wallet') {
        // For wallet destination, use the creator's wallet address
        dbData.destination_address = userAddress; // Use the actual user's wallet address
        dbData.creator_wallet = userAddress; // Ensure creator_wallet is also updated
      } else if (fundDestination.type === 'pod_treasury') {
        dbData.destination_address = fundDestination.treasuryAddress; // Pod treasury address
      }
      dbData.pod_id = fundDestination.podId || null;
    }

    console.log('🔄 Updating product with transformed data:', dbData);

    const { data, error } = await supabase
      .from('products')
      .update(dbData)
      .eq('id', productId)
      .select()
      .single();

    if (error) {
      console.error('Error updating product:', error);
      throw error;
    }

    console.log('✅ Product updated successfully:', data);
    return data;
  } catch (error) {
    console.error('Failed to update product:', error);
    throw error;
  }
};

// Delete a product
export const deleteProduct = async (productId: string): Promise<void> => {
  try {
    console.log('🗑️ Attempting to delete product:', productId);

    const { data, error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId)
      .select();

    console.log('🗑️ Delete operation result:', { data, error });

    if (error) {
      console.error('Error deleting product:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      console.warn(
        '⚠️ No rows were deleted. Product may not exist or you may not have permission.',
      );
      throw new Error('Product not found or permission denied');
    }

    console.log('✅ Product deleted successfully:', data);
  } catch (error) {
    console.error('Failed to delete product:', error);
    throw error;
  }
};

// NEW: Get accessible products for a user using the new access control system
export const getAccessibleProductsForUser = async (
  userAddress: string,
  tokenBalances?: any,
  userHats?: string[],
): Promise<IProduct[]> => {
  try {
    console.log(`🛍️ Fetching accessible products for user: ${userAddress}`);

    // Get user identity using the new normalized system
    const identity = await getUserIdentity(
      userAddress,
      tokenBalances,
      userHats,
    );
    console.log(`🎩 User identity for marketplace:`, {
      tokens: identity.userTokens.length,
      hats: identity.userHats.length,
    });

    // Get accessible products using the new utility
    const accessibleProducts = await getAccessibleProducts(identity);
    console.log(`🛒 Found ${accessibleProducts.length} accessible products`);

    return accessibleProducts;
  } catch (error) {
    console.error('Failed to get accessible products:', error);
    throw error;
  }
};

// Helper function to check if user can access a specific product
export const canUserAccessProduct = async (
  productId: string,
  userAddress: string,
  tokenBalances?: any,
  userHats?: string[],
): Promise<boolean> => {
  try {
    const accessibleProducts = await getAccessibleProductsForUser(
      userAddress,
      tokenBalances,
      userHats,
    );

    return accessibleProducts.some((product) => product.id === productId);
  } catch (error) {
    console.error('Error checking product access:', error);
    return false;
  }
};

// Get products manageable by a user based on pod permissions
export const getUserManagedProducts = async (
  userAddress: string,
): Promise<IProduct[]> => {
  try {
    console.log(`🛍️ Fetching manageable products for user: ${userAddress}`);

    // Check if user has Executive Pod for global management using token balances
    const { fetchTokenBalances } = await import('@/utils/fetchTokenBalances');
    const tokenBalances = await fetchTokenBalances(userAddress);
    const hasExecutivePod = tokenBalances.hasExecutivePod;

    console.log(`👑 User has Executive Pod access: ${hasExecutivePod}`);

    // Get all products
    const { data: allProducts, error: productsError } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (productsError) {
      console.error('Error fetching products:', productsError);
      throw productsError;
    }

    if (!allProducts || allProducts.length === 0) {
      console.log('📦 No products found in database');
      return [];
    }

    console.log(`📦 Found ${allProducts.length} total products`);

    // If user has Executive Pod, they can manage all products
    if (hasExecutivePod) {
      console.log(
        `👑 Executive Pod member - can manage all ${allProducts.length} products`,
      );
      return allProducts;
    }

    // For non-executive users, check pod-specific management permissions
    // Get user's pod permissions directly using hat balances
    const { createPublicClient, http } = await import('viem');
    const { base } = await import('viem/chains');

    const publicClient = createPublicClient({
      chain: base,
      transport: http(),
    });

    const hatsContract = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;

    if (!hatsContract) {
      console.error('🎩 HATS_CONTRACT not configured');
      return [];
    }

    // Get all pod permissions with marketplace management enabled
    const { data: managementPermissions, error: permError } = await supabase
      .from('pod_permission_lookup')
      .select('pod_id, role_name, permissions, token_address')
      .eq('is_active', true);

    if (permError) {
      console.error('Error fetching pod permissions:', permError);
      return [];
    }

    // Filter to only permissions with marketplaceManage = true
    const manageableRoles =
      managementPermissions?.filter((perm) => {
        const permissions =
          typeof perm.permissions === 'string'
            ? JSON.parse(perm.permissions)
            : perm.permissions;
        return permissions.marketplaceManage === true;
      }) || [];

    console.log(
      `🎯 Found ${manageableRoles.length} roles with marketplace management permissions`,
    );

    if (manageableRoles.length === 0) {
      console.log('❌ No roles found with marketplace management permissions');
      return [];
    }

    // Check which of these roles the user actually has
    const userManageableRoles = [];
    const HATS_ABI = [
      {
        inputs: [
          { name: 'account', type: 'address' },
          { name: 'hat', type: 'uint256' },
        ],
        name: 'balanceOf',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
    ];

    for (const role of manageableRoles) {
      try {
        const balance = await publicClient.readContract({
          address: hatsContract,
          abi: HATS_ABI,
          functionName: 'balanceOf',
          args: [userAddress as `0x${string}`, role.token_address as `0x${string}`],
        });

        if (Number(balance) > 0) {
          userManageableRoles.push(role);
          console.log(
            `✅ User has manageable role: ${role.role_name} in pod ${role.pod_id}`,
          );
        }
      } catch (error) {
        console.error(
          `Error checking hat balance for ${role.role_name}:`,
          error,
        );
      }
    }

    if (userManageableRoles.length === 0) {
      console.log('❌ User has no manageable roles');
      return [];
    }

    // Now filter products based on what pods the user can manage
    const manageableProducts = allProducts.filter((product) => {
      // Products with no required_token can only be managed by Executive Pod (already handled above)
      if (!product.required_token) {
        return false; // Non-executive users can't manage unrestricted products
      }

      // Check if the product's required_token matches any pod this user can manage
      // For simple tokens like 'dev', 'exec', we need to map them to pod permissions
      const productToken = product.required_token;

      // Check if any of the user's manageable roles can manage this product token
      const canManage = userManageableRoles.some((role) => {
        // For now, simplified logic: if user can manage marketplace for any pod,
        // they can manage products with matching simple tokens
        return (
          productToken === 'dev' ||
          productToken === 'exec' ||
          productToken.startsWith('pod_')
        );
      });

      return canManage;
    });

    console.log(
      `🎯 User can manage ${manageableProducts.length} out of ${allProducts.length} products`,
    );
    return manageableProducts;
  } catch (error) {
    console.error('Failed to get user managed products:', error);
    throw error;
  }
};

// Check if user can manage a specific product based on pod permissions
export const canUserManageProduct = async (
  productId: string,
  userAddress: string,
): Promise<boolean> => {
  try {
    console.log(
      `🔍 Checking if user ${userAddress} can manage product ${productId}`,
    );

    // Get the specific product
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (productError || !product) {
      console.error('Product not found:', productError);
      return false;
    }

    // Use the new pod-based system to check management permissions
    const managedProducts = await getUserManagedProducts(userAddress);
    const canManage = managedProducts.some(
      (p) => p.id.toString() === productId,
    );

    console.log(
      `${canManage ? '✅' : '❌'} User ${canManage ? 'can' : 'cannot'} manage product: ${product.title}`,
    );
    return canManage;
  } catch (error) {
    console.error('Error checking product management permission:', error);
    return false;
  }
};
