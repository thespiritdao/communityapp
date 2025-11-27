// src/app/api/chat-groups/route.ts
import { NextResponse } from 'next/server';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import { getUserIdentity, getAccessibleChatGroups, } from '@/utils/accessControlUtils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet_address = searchParams.get('wallet_address');
  const user_hats_param = searchParams.get('user_hats'); // Optional HAT IDs as comma-separated string
  
  if (!wallet_address) {
    return NextResponse.json({ error: 'Missing wallet_address parameter' }, { status: 400 });
  }

  try {
    console.log(`🔍 Fetching chat groups for wallet: ${wallet_address}`);
    
    // Get token balances for the wallet
    const tokenBalances = await fetchTokenBalances(wallet_address);

    // Parse HAT IDs from query parameter
    const userHats = user_hats_param 
      ? user_hats_param.split(',').map(hat => hat.trim()).filter(Boolean)
      : [];

    // Get user identity using the new normalized system
    const identity = await getUserIdentity(wallet_address, tokenBalances, userHats);
    console.log(`🎩 User identity:`, {
      tokens: identity.userTokens.length,
      hats: identity.userHats.length
    });

    // Get accessible chat groups using the new utility
    const accessibleGroups = await getAccessibleChatGroups(identity);
    console.log(`💬 Found ${accessibleGroups.length} accessible chat groups`);

    return NextResponse.json({ 
      chatGroups: accessibleGroups,
      userIdentity: {
        tokenCount: identity.userTokens.length,
        hatCount: identity.userHats.length
      }
    });
  } catch (error: any) {
    console.error('Error fetching chat groups:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
