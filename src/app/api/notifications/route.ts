import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import {
  getFulfillmentManagers,
  getUserProfile,
  formatUserDisplayName,
} from '@/features/marketplace/utils/marketplaceNotificationHelpers';
import { sendServerNotification } from '@/lib/serverNotifications';

/**
 * Marketplace Notifications API Route
 *
 * MIGRATED: Phase 2 (Extended) - Now uses HATS-based membership lookups
 *
 * Handles marketplace notification creation for:
 * - Purchase completed → Notify fulfillment managers
 * - User mentioned → Notify mentioned user
 * - Order status updated → Notify buyer
 *
 * CHANGES FROM LEGACY:
 * - Uses new marketplaceNotificationHelpers (database queries, not RPC calls)
 * - Uses unifiedNotificationService for all notifications
 * - Consistent notification format with category and priority
 *
 * @see src/features/marketplace/utils/marketplaceNotificationHelpers.ts
 * @see src/services/unifiedNotificationService.ts
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, ...notificationData } = body;

    console.log('📥 Notification API called with:', { type, notificationData });

    switch (type) {
      case 'purchase_completed': {
        const {
          buyerAddress,
          productName,
          productId,
          orderId,
          requiredToken,
          transactionHash,
          creatorWallet,
          podId,
        } = notificationData;

        // Validate required fields
        if (!buyerAddress || !productName || !productId) {
          return NextResponse.json(
            {
              error:
                'Missing required fields: buyerAddress, productName, productId',
            },
            { status: 400 },
          );
        }

        console.log('🛒 Creating purchase notification for:', {
          buyerAddress,
          productName,
          productId,
          orderId,
          requiredToken,
          transactionHash,
          creatorWallet,
          podId,
        });

        // Get buyer profile for notification message
        const buyerProfile = await getUserProfile(buyerAddress);
        const buyerName = formatUserDisplayName(buyerAddress, buyerProfile);

        let notificationsSent = 0;

        // Notify product creator first (if exists)
        if (creatorWallet) {
          try {
            const result = await sendServerNotification({
              recipient_address: creatorWallet.toLowerCase(),
              sender_address: buyerAddress.toLowerCase(),
              notification_type: 'purchase_completed',
              title: 'Your Product Was Purchased!',
              message: `${buyerName} has purchased your product "${productName}". Please check the order details to begin fulfillment.`,
              context_url: `/marketplace/orders/${orderId}`,
              context_type: 'marketplace',
              context_id: orderId,
              priority: 'high',
            });

            if (!result.skipped) {
              console.log(`�� Notified product creator: ${creatorWallet}`);
              notificationsSent++;
            }
          } catch (notifError) {
            console.error(`❌ Failed to notify product creator ${creatorWallet}:`, notifError);
          }
        } else {
          console.warn(`⚠️ No creatorWallet provided for product "${productName}"`);
        }

        // Get fulfillment managers using HATS-based membership
        const managers = await getFulfillmentManagers(requiredToken);

        if (managers.length === 0) {
          console.warn('⚠️ No fulfillment managers found for this product');

          // If we notified the creator, that's sufficient
          if (creatorWallet) {
            return NextResponse.json({
              success: true,
              notifications_sent: notificationsSent,
              warning: 'No additional fulfillment managers found',
            });
          }

          return NextResponse.json({
            success: true,
            warning: 'No fulfillment managers found and no product creator specified',
          });
        }

        console.log(`📨 Notifying ${managers.length} fulfillment managers`);

        // Create marketplace notifications for each manager (excluding creator if already notified)
        for (const manager of managers) {
          // Skip if this manager is the product creator (already notified)
          if (creatorWallet && manager.wallet_address.toLowerCase() === creatorWallet.toLowerCase()) {
            console.log(`⏭️ Skipping duplicate notification for creator ${manager.wallet_address}`);
            continue;
          }

          try {
            const result = await sendServerNotification({
              recipient_address: manager.wallet_address.toLowerCase(),
              sender_address: buyerAddress.toLowerCase(),
              notification_type: 'purchase_completed',
              title: 'Product Purchase Requires Fulfillment',
              message: `${buyerName} has purchased "${productName}". Please begin the process of facilitating the delivery of the item.`,
              context_url: `/marketplace/orders/${orderId}`,
              context_type: 'marketplace',
              context_id: orderId,
              priority: 'high',
            });

            if (!result.skipped) {
              console.log(`✅ Notified fulfillment manager: ${manager.wallet_address}`);
              notificationsSent++;
            }
          } catch (notifError) {
            console.error(`❌ Failed to notify ${manager.wallet_address}:`, notifError);
          }
        }

        return NextResponse.json({
          success: true,
          notifications_sent: notificationsSent,
        });
      }

      case 'user_mentioned': {
        const {
          recipientAddress,
          senderAddress,
          contextType,
          contextId,
          contextUrl,
          message,
        } = notificationData;

        // Validate required fields
        if (!recipientAddress || !senderAddress || !contextType || !contextId) {
          return NextResponse.json(
            { error: 'Missing required fields for user mention notification' },
            { status: 400 },
          );
        }

        console.log('👤 Creating user mention notification');

        // Get sender profile for display name
        const senderProfile = await getUserProfile(senderAddress);
        const senderName = formatUserDisplayName(senderAddress, senderProfile);

        // Create mention notification
        await sendServerNotification({
          recipient_address: recipientAddress,
          sender_address: senderAddress,
          notification_type: 'user_mentioned',
          title: 'You were mentioned',
          message: message || `${senderName} mentioned you`,
          context_url: contextUrl,
          context_type: contextType,
          context_id: contextId,
          priority: 'medium',
        });

        console.log('✅ User mention notification created');
        return NextResponse.json({ success: true });
      }

      case 'order_status_updated': {
        const {
          recipientAddress: orderBuyerAddress,
          senderAddress: managerAddress,
          orderStatus,
          productName: orderProductName,
          orderId: statusUpdateOrderId,
          trackingNumber: orderTrackingNumber,
          notes: orderNotes,
        } = notificationData;

        // Validate required fields
        if (
          !orderBuyerAddress ||
          !managerAddress ||
          !orderStatus ||
          !orderProductName ||
          !statusUpdateOrderId
        ) {
          return NextResponse.json(
            {
              error:
                'Missing required fields for order status update notification',
            },
            { status: 400 },
          );
        }

        console.log('📦 Creating order status update notification');

        // Get manager profile for display name
        const managerProfile = await getUserProfile(managerAddress);
        const managerName = formatUserDisplayName(
          managerAddress,
          managerProfile,
        );

        // Format status-specific message
        let statusMessage = '';
        let notificationPriority: 'low' | 'medium' | 'high' | 'urgent' =
          'medium';

        switch (orderStatus.toLowerCase()) {
          case 'processing':
            statusMessage = `${managerName} is now processing your order for "${orderProductName}".`;
            notificationPriority = 'medium';
            break;
          case 'shipped':
            statusMessage = `Good news! Your order for "${orderProductName}" has been shipped.`;
            if (orderTrackingNumber) {
              statusMessage += ` Tracking number: ${orderTrackingNumber}`;
            }
            notificationPriority = 'high';
            break;
          case 'delivered':
            statusMessage = `Your order for "${orderProductName}" has been delivered. Enjoy!`;
            notificationPriority = 'high';
            break;
          case 'cancelled':
            statusMessage = `Your order for "${orderProductName}" has been cancelled.`;
            if (orderNotes) {
              statusMessage += ` Reason: ${orderNotes}`;
            }
            notificationPriority = 'high';
            break;
          case 'refunded':
            statusMessage = `Your order for "${orderProductName}" has been refunded.`;
            notificationPriority = 'high';
            break;
          default:
            statusMessage = `Your order for "${orderProductName}" status has been updated to: ${orderStatus}`;
            notificationPriority = 'medium';
        }

        if (
          orderNotes &&
          !['cancelled', 'refunded'].includes(orderStatus.toLowerCase())
        ) {
          statusMessage += ` Note: ${orderNotes}`;
        }

        // Create order status notification
        await sendServerNotification({
          recipient_address: orderBuyerAddress,
          sender_address: managerAddress,
          notification_type: 'order_status_updated',
          title: `Order Status: ${orderStatus}`,
          message: statusMessage,
          context_url: `/marketplace/orders/${statusUpdateOrderId}`,
          context_type: 'marketplace',
          context_id: statusUpdateOrderId,
          priority: notificationPriority,
        });

        console.log('✅ Order status update notification created');
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          { error: `Unsupported notification type: ${type}` },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error('❌ Notification API error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    );
  }
}
