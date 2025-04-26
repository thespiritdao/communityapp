// src/app/api/chat-groups/route.ts
import { NextResponse } from 'next/server';
import { supabase } from 'src/utils/supabaseClient';
import { fetchTokenBalances } from 'src/utils/fetchTokenBalances';

const normalize = (value: string | null) => value?.trim().toLowerCase() || '';

const EXECUTIVE_POD_HAT_ID = "0x0000008800010000000000000000000000000000000000000000000000000000";
const DEV_POD_HAT_ID = "0x0000008800020000000000000000000000000000000000000000000000000000";
const PROOF_OF_CURIOSITY = "0x756d2ad6642c2ed43fd87af70d83f277ec0a669f";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet_address = searchParams.get('wallet_address');
  if (!wallet_address) {
    return NextResponse.json({ error: 'Missing wallet_address parameter' }, { status: 400 });
  }

  try {
    // Get token balances for the wallet
    const tokenBalances = await fetchTokenBalances(wallet_address);

    // Fetch all chat groups from Supabase
    const { data: chatGroupsData, error } = await supabase
      .from('chat_groups')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter chat groups based on token gating
    const filteredGroups = (chatGroupsData || []).filter((group: any) => {
      const requiredToken = normalize(group.required_token);

      if (!requiredToken) return true;
      if (requiredToken === normalize(PROOF_OF_CURIOSITY) && tokenBalances.hasProofOfCuriosity) return true;
      if (requiredToken === normalize(EXECUTIVE_POD_HAT_ID) && tokenBalances.hasExecutivePod) return true;
      if (requiredToken === normalize(DEV_POD_HAT_ID) && tokenBalances.hasDevPod) return true;
      return false;
    });

    return NextResponse.json({ chatGroups: filteredGroups });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
