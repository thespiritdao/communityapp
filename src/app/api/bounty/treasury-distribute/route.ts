import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DISTRIBUTE_ABI = parseAbi([
  'function distributeTokens(address token, address[] memory recipients, uint256[] memory amounts, string memory reason) external',
]);

export async function POST(request: NextRequest) {
  try {
    const { podId, tokenAddress, recipientAddress, amount } = await request.json();

    if (!podId || !tokenAddress || !recipientAddress || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: podId, tokenAddress, recipientAddress, amount' },
        { status: 400 },
      );
    }

    const ADMIN_PRIVATE_KEY = process.env.POD_ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!ADMIN_PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'Server configuration error: admin key missing' },
        { status: 500 },
      );
    }

    // Fetch treasury address from DB
    const { data: pod, error: podError } = await supabase
      .from('pods')
      .select('treasury_contract_address, name')
      .eq('id', podId)
      .single();

    if (podError || !pod) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    const treasuryAddress = pod.treasury_contract_address as `0x${string}` | null;
    if (!treasuryAddress) {
      return NextResponse.json(
        { error: `Pod "${pod.name}" has no treasury deployed` },
        { status: 400 },
      );
    }

    const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
    const adminAccount = privateKeyToAccount(ADMIN_PRIVATE_KEY as `0x${string}`);

    const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
    const walletClient = createWalletClient({
      account: adminAccount,
      chain: base,
      transport: http(RPC_URL),
    });

    console.log(`🏦 Treasury distribute: ${pod.name} → ${recipientAddress}, amount: ${amount}`);

    const txHash = await walletClient.writeContract({
      address: treasuryAddress,
      abi: DISTRIBUTE_ABI,
      functionName: 'distributeTokens',
      args: [
        tokenAddress as `0x${string}`,
        [recipientAddress as `0x${string}`],
        [BigInt(amount)],
        'Bounty funding',
      ],
    });

    console.log(`⏳ Treasury distribute tx submitted: ${txHash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== 'success') {
      return NextResponse.json(
        { error: 'Treasury distribution transaction reverted', txHash },
        { status: 500 },
      );
    }

    console.log(`✅ Treasury distribute confirmed: ${txHash}`);

    return NextResponse.json({ success: true, txHash });
  } catch (error) {
    console.error('❌ Treasury distribute error:', error);
    return NextResponse.json(
      {
        error: 'Treasury distribution failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
