import { NextRequest, NextResponse } from 'next/server';
import { notificationService } from '../../../utils/notificationService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, ...notificationData } = body;

    console.log('📥 Notification API called with:', { type, notificationData });

    switch (type) {
      case 'purchase_completed':
        const { buyerAddress, productName, productId, requiredToken, transactionHash } = notificationData;
        
        if (!buyerAddress || !productName || !productId) {
          return NextResponse.json(
            { error: 'Missing required fields: buyerAddress, productName, productId' },
            { status: 400 }
          );
        }

        console.log('🛒 Creating purchase notification for:', {
          buyerAddress,
          productName,
          productId,
          requiredToken,
          transactionHash
        });

        await notificationService.createPurchaseNotification(
          buyerAddress,
          productName,
          productId,
          requiredToken,
          transactionHash
        );

        return NextResponse.json({ success: true });

      case 'user_mentioned':
        const { recipientAddress, senderAddress, contextType, contextId, contextUrl } = notificationData;
        
        if (!recipientAddress || !senderAddress || !contextType || !contextId) {
          return NextResponse.json(
            { error: 'Missing required fields for user mention notification' },
            { status: 400 }
          );
        }

        await notificationService.createUserMentionNotification(
          recipientAddress,
          senderAddress,
          contextType,
          contextId,
          contextUrl
        );

        return NextResponse.json({ success: true });

      default:
        return NextResponse.json(
          { error: `Unsupported notification type: ${type}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('❌ Notification API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}