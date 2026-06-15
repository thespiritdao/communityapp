import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { createConfiguredPublicClient, getWriteTransport } from '@/utils/rpcClient';
import { getHatId } from '@/lib/hatRegistry';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const HATS_CONTRACT = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;

const DISTRIBUTE_ABI = parseAbi([
  'function distributeTokens(address token, address[] memory recipients, uint256[] memory amounts, string memory reason) external',
]);

const HATS_ABI = parseAbi([
  'function balanceOf(address wearer, uint256 hatId) view returns (uint256)',
]);

// Resolve the caller's wallet from a Supabase-signed JWT. wallet_address is a
// top-level server-signed claim; user_metadata is a fallback for older tokens.
function getWalletFromToken(token: string): string | null {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // ── AuthN: require a verified Supabase JWT ──────────────────────────────
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const callerAddress = getWalletFromToken(token);
    if (!callerAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Fetch treasury address + this pod's management hat from DB
    const { data: pod, error: podError } = await supabase
      .from('pods')
      .select('treasury_contract_address, name, management_hat_id')
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

    const adminAccount = privateKeyToAccount(ADMIN_PRIVATE_KEY as `0x${string}`);

    const publicClient = createConfiguredPublicClient();

    // ── AuthZ: caller must wear this pod's management hat OR the Executive hat ──
    // Distribution spends the pod's treasury via the admin key; gate it to pod
    // leadership (or Exec) verified ON-CHAIN, not just a valid session. Without
    // this, any authenticated user could drain any pod's treasury.
    const candidateHatIds: bigint[] = [];
    if (pod.management_hat_id) {
      try {
        candidateHatIds.push(BigInt(pod.management_hat_id as string));
      } catch {
        /* malformed hat id in DB — ignore, fall back to Exec check */
      }
    }
    // Exec hat is an OPTIONAL fallback authorizer — getHatId returns undefined
    // (does not throw) if unresolved, so a transient lookup miss never blocks a
    // caller who legitimately holds the pod's own management hat.
    const execHatIdHex = await getHatId('EXECUTIVE_POD_LEADER');
    if (execHatIdHex) candidateHatIds.push(BigInt(execHatIdHex));

    if (candidateHatIds.length === 0) {
      return NextResponse.json(
        { error: `Pod "${pod.name}" has no management hat configured; cannot authorize distribution` },
        { status: 403 },
      );
    }

    const hatBalances = await Promise.all(
      candidateHatIds.map((hatId) =>
        publicClient.readContract({
          address: HATS_CONTRACT,
          abi: HATS_ABI,
          functionName: 'balanceOf',
          args: [callerAddress as `0x${string}`, hatId],
        }),
      ),
    );
    const isAuthorized = hatBalances.some((b) => b > 0n);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Forbidden: pod leadership or Executive role required to distribute from this treasury' },
        { status: 403 },
      );
    }

    const walletClient = createWalletClient({
      account: adminAccount,
      chain: base,
      transport: getWriteTransport(),
    });

    console.log(`🏦 Treasury distribute: ${pod.name} → ${recipientAddress}, amount: ${amount} (by ${callerAddress})`);

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
