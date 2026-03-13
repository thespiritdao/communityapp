/**
 * POST /api/onboarding/mint-poc
 *
 * Mints a Proof of Curiosity token to a new user during onboarding.
 * Uses the CDP smart wallet + Coinbase paymaster — gasless.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, encodeFunctionData, parseAbi, getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { Coinbase, toSmartWallet, sendUserOperation, waitForUserOperation } from '@coinbase/coinbase-sdk';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const HAT_MINTER_ABI = parseAbi([
  'function mintTNMemberHat(address recipient) external returns (bool)',
  'function hasTNMemberHat(address user) external view returns (bool)',
  'function hasAdminHat() external view returns (bool)',
]);

const TN_POD_ID = 'f2bc166d-33d5-47dc-8409-ea8d445d3fc0';
const TN_MEMBER_HAT_ID = '0x0000074900020001000100000000000000000000000000000000000000000000';

async function mintTNMemberHat(walletAddress: string): Promise<void> {
  const hatMinterAddress = process.env.NEXT_PUBLIC_HAT_MINTER as `0x${string}` | undefined;
  const adminPrivateKey = process.env.POD_ADMIN_PRIVATE_KEY;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

  if (!hatMinterAddress || !adminPrivateKey) {
    console.warn('⚠️ HatMinter not configured — skipping TN Member HAT mint');
    return;
  }

  const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const account = privateKeyToAccount(
    adminPrivateKey.startsWith('0x') ? adminPrivateKey as `0x${string}` : `0x${adminPrivateKey}`
  );
  const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

  const contract = getContract({
    address: hatMinterAddress,
    abi: HAT_MINTER_ABI,
    client: { public: publicClient, wallet: walletClient },
  });

  const alreadyHas = await contract.read.hasTNMemberHat([walletAddress as `0x${string}`]);
  if (alreadyHas) {
    console.log('ℹ️ User already has TN Member HAT');
    return;
  }

  const hash = await contract.write.mintTNMemberHat([walletAddress as `0x${string}`]);
  await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  console.log('✅ TN Member HAT minted:', hash);

  // Sync to pod_members
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('pod_members').upsert({
      pod_id: TN_POD_ID,
      wallet: walletAddress.toLowerCase(),
      membership_type: 'member',
      role: 'member',
      hat_id: TN_MEMBER_HAT_ID,
      is_active: true,
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'pod_id,wallet' });
  }
}

const POC_ABI = [
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [{ name: 'tokenId', type: 'uint256' }],
  },
  {
    name: 'hasToken',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export async function POST(request: NextRequest) {
  try {
    const { walletAddress } = await request.json();

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json({ success: false, error: 'Invalid wallet address' }, { status: 400 });
    }

    const contractAddress = process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY as `0x${string}` | undefined;
    const privateKey = process.env.POD_ADMIN_PRIVATE_KEY;
    const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER;
    const cdpApiKey = process.env.CDP_API_KEY;
    let cdpPrivateKey = process.env.EXECUTIVE_MINTING_PRIVATE_KEY;

    if (!contractAddress) return NextResponse.json({ success: false, error: 'PoC contract not configured' }, { status: 500 });
    if (!privateKey) return NextResponse.json({ success: false, error: 'Admin key not configured' }, { status: 500 });
    if (!paymasterUrl) return NextResponse.json({ success: false, error: 'Paymaster not configured' }, { status: 500 });
    if (!cdpApiKey || !cdpPrivateKey) return NextResponse.json({ success: false, error: 'CDP credentials not configured' }, { status: 500 });

    if (cdpPrivateKey.includes('\\n')) cdpPrivateKey = cdpPrivateKey.replace(/\\n/g, '\n');

    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
    const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });

    // Check if user already has token
    const alreadyHas = await publicClient.readContract({
      address: contractAddress,
      abi: POC_ABI,
      functionName: 'hasToken',
      args: [walletAddress as `0x${string}`],
    });

    if (alreadyHas) {
      return NextResponse.json({ success: true, alreadyHadToken: true, message: 'User already holds PoC token' });
    }

    // Initialize CDP and mint via smart wallet (gasless)
    Coinbase.configure({ apiKeyName: cdpApiKey, privateKey: cdpPrivateKey });

    const signer = privateKeyToAccount(
      privateKey.startsWith('0x') ? privateKey as `0x${string}` : `0x${privateKey}`
    );
    const wallet = toSmartWallet({
      smartWalletAddress: '0x05c06af9fe1a996144902D9571d1d2783866cF63',
      signer,
    });

    const callData = encodeFunctionData({
      abi: POC_ABI,
      functionName: 'mint',
      args: [walletAddress as `0x${string}`],
    });

    const result = await sendUserOperation(wallet, {
      calls: [{ to: contractAddress, data: callData, value: 0n }],
      chainId: 8453,
      paymasterUrl,
    });

    const receipt = await waitForUserOperation({
      userOpHash: result.userOpHash,
      smartWalletAddress: wallet.address,
    });

    const txHash = receipt.transaction_hash || result.userOpHash;

    // Also mint TN Member HAT (non-blocking — failure doesn't fail onboarding)
    mintTNMemberHat(walletAddress).catch((err) =>
      console.error('⚠️ TN Member HAT mint failed (non-critical):', err)
    );

    return NextResponse.json({
      success: true,
      transactionHash: txHash,
      message: 'Proof of Curiosity token minted successfully',
    });

  } catch (error) {
    console.error('❌ PoC mint error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'PoC minting failed' },
      { status: 500 },
    );
  }
}
