import { supabase } from '@/lib/supabase';
import { createSupabaseSession } from '@/utils/createSupabaseSession';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import type { ICartProduct } from '../../models';

export interface OrderCreationConfig {
  products: ICartProduct[];
  address: string;
  selectedToken: { symbol: string };
  transactionHash?: string;
  receipt?: any;
}

export async function ensureSupabaseAuth(address: string): Promise<void> {
  console.log('🔐 Ensuring Supabase authentication for order creation...');
  
  try {
    const authResponse = await fetch('/api/auth/onchainkit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: address.toLowerCase() })
    });
    
    if (!authResponse.ok) {
      throw new Error(`Auth API failed: ${authResponse.status}`);
    }
    
    const authData = await authResponse.json();
    console.log('✅ Auth API response received:', { hasToken: !!authData.supabaseToken });
    
    await createSupabaseSession(authData.supabaseToken, authData.supabaseRefreshToken);
    console.log('✅ Supabase session established for order creation');
  } catch (authError) {
    console.error('❌ Failed to establish Supabase session:', authError);
    throw new Error(`Authentication failed: ${authError.message}`);
  }
}

export async function createOrder(
  product: ICartProduct,
  config: OrderCreationConfig
): Promise<{ orderId?: string; error?: string }> {
  console.log('📦 Creating order record for product:', {
    productName: product.name || product.title,
    productId: product.id.toString(),
    requiredToken: product.required_token,
    buyerAddress: config.address,
    quantity: product.quantity || 1
  });
  
  // FIX: Use correct property names with underscores (price_self, price_system)
  const productSelfPrice = config.selectedToken.symbol === "$SELF" ? 
    (product.price_self || 0) * (product.quantity || 1) : 0;
  const productSystemPrice = config.selectedToken.symbol === "$SYSTEM" ? 
    (product.price_system || 0) * (product.quantity || 1) : 0;
  
  console.log('💰 Price calculation:', {
    token: config.selectedToken.symbol,
    price_self: product.price_self,
    price_system: product.price_system,
    quantity: product.quantity || 1,
    calculatedSelfPrice: productSelfPrice,
    calculatedSystemPrice: productSystemPrice
  });

  try {
    const { data: orderData, error: orderError } = await supabase
      .from('marketplace_orders')
      .insert({
        buyer_address: config.address.toLowerCase(),
        product_id: product.id.toString(),
        product_name: product.name || product.title,
        quantity: product.quantity || 1,
        price_paid_self: productSelfPrice,
        price_paid_system: productSystemPrice,
        transaction_hash: config.transactionHash,
        status: 'processing'
      })
      .select()
      .single();

    if (orderError) {
      console.error('❌ Error creating order:', orderError);
      return { error: orderError.message };
    }

    console.log('✅ Order created:', orderData);
    return { orderId: orderData.id };
  } catch (error) {
    console.error('❌ Failed to create order:', error);
    return { error: error.message };
  }
}

export async function sendOrderNotifications(
  orderData: any,
  product: ICartProduct,
  config: OrderCreationConfig
): Promise<void> {
  try {
    const { data: creatorData } = await supabase
      .from('profiles')
      .select('address')
      .eq('user_id', product.owner_id)
      .single();

    const creatorAddress = creatorData?.address || product.creator_wallet;

    if (creatorAddress && creatorAddress !== config.address) {
      console.log('📬 Sending notification to creator:', creatorAddress);

      try {
        // Notify creator of new order
        await unifiedNotificationService.createNotification({
          recipient_address: creatorAddress.toLowerCase(),
          sender_address: config.address.toLowerCase(),
          notification_type: 'marketplace_purchase_fulfillment',
          title: 'New Order Received',
          message: `You received an order for ${product.name || product.title} (qty: ${product.quantity || 1})`,
          context_type: 'marketplace',
          context_id: orderData.id,
          context_url: `/marketplace/orders/${orderData.id}`,
          priority: 'high'
        });

        // Notify buyer of successful order
        await unifiedNotificationService.createNotification({
          recipient_address: config.address.toLowerCase(),
          sender_address: 'system',
          notification_type: 'marketplace_order_status',
          title: 'Order Placed Successfully',
          message: `Your order for ${product.name || product.title} has been placed`,
          context_type: 'marketplace',
          context_id: orderData.id,
          context_url: `/marketplace/orders/${orderData.id}`,
          priority: 'medium'
        });

        console.log('✅ Order notifications sent successfully');
      } catch (notifError) {
        console.error('⚠️ Error sending order notifications:', notifError);
      }
    }
  } catch (error) {
    console.error('Failed to send notifications:', error);
  }
}

export async function processAllOrders(config: OrderCreationConfig): Promise<void> {
  console.log('🚀 STARTING ORDER CREATION AND NOTIFICATION PROCESS');
  console.log('🛒 Processing', config.products.length, 'products');
  
  await ensureSupabaseAuth(config.address);
  
  const orderPromises = config.products.map(async (product) => {
    const { orderId, error } = await createOrder(product, config);
    
    if (!error && orderId) {
      await sendOrderNotifications({ id: orderId }, product, config);
    }
    
    return { orderId, error };
  });

  const results = await Promise.allSettled(orderPromises);
  
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.orderId);
  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error));
  
  console.log(`✅ Successfully created ${successful.length}/${config.products.length} orders`);
  
  if (failed.length > 0) {
    console.error(`❌ Failed to create ${failed.length} orders:`, failed);
  }
}