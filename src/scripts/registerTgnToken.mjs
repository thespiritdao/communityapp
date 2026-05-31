/**
 * Register the TreeGens $TGN token in the `tokens` registry so it can gate pod
 * roles (decimal-aware ERC-20 threshold) and display read-only balances.
 *
 * Usage:
 *   TGN_TOKEN_ADDRESS=0x<tgn_on_base> node src/scripts/registerTgnToken.mjs
 *
 * The contract address is REQUIRED and must be the canonical $TGN ERC-20 on Base.
 * The TreeGens onboarding doc supplies Hydrex *pool* addresses (AZUSD/TGN,
 * USDC/TGN) — those are NOT the token address. Confirm the token contract with
 * TreeGens before running. `decimals` is read on-chain (never assumed).
 *
 * Follows the registerAdvocateToken.mjs pattern.
 */
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import dotenv from 'dotenv';

// Load .env first, then let .env.local override if present.
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const TGN_ADDRESS = process.env.TGN_TOKEN_ADDRESS;

if (!TGN_ADDRESS || !/^0x[0-9a-fA-F]{40}$/.test(TGN_ADDRESS)) {
  console.error(
    '❌ TGN_TOKEN_ADDRESS env var missing or invalid. Pass the canonical $TGN ERC-20 contract on Base.',
  );
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

const ERC20_ABI = [
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    name: 'symbol',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
];

async function registerTgnToken() {
  const rpcUrl =
    process.env.NEXT_PUBLIC_RPC_URL ||
    (process.env.NEXT_PUBLIC_CDP_API_CLIENT
      ? `https://api.developer.coinbase.com/rpc/v1/base/${process.env.NEXT_PUBLIC_CDP_API_CLIENT}`
      : 'https://mainnet.base.org');

  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  console.log('🌳 Reading $TGN token metadata on-chain...');
  const decimals = Number(
    await publicClient.readContract({
      address: TGN_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }),
  );
  let symbol = 'TGN';
  try {
    symbol = await publicClient.readContract({
      address: TGN_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'symbol',
    });
  } catch {
    /* keep default */
  }

  // NOTE: the live `tokens` table has no `symbol` column — the display name IS
  // the `name` field (e.g. "$SYSTEM", "$SELF"). We follow that convention.
  void symbol;

  // Optional community scope. Set OWNER_POD_ID to the TreeGens pod UUID so $TGN
  // is offered ONLY inside that community. If unset, the token is registered
  // platform-wide (owner_pod_id NULL) and you can scope it later by setting the
  // column once the pod exists.
  const ownerPodId = process.env.OWNER_POD_ID || null;

  const tgnToken = {
    id: 'tgn',
    name: '$TGN',
    contract_address: TGN_ADDRESS,
    token_type: 'erc20',
    decimals,
    is_active: true,
    // Governance guardrail: blessed for role/vote gating only. $TGN is a
    // governance signal — never issued, held, or exchanged by the platform.
    gating_enabled: true,
    owner_pod_id: ownerPodId,
    description: 'TreeGens community token ($TGN) on Base — governance signal only',
  };

  console.log('🎫 Registering:', tgnToken);

  const { data: existing } = await supabase
    .from('tokens')
    .select('*')
    .ilike('contract_address', TGN_ADDRESS)
    .maybeSingle();

  if (existing) {
    const { data: updated, error } = await supabase
      .from('tokens')
      .update({
        name: tgnToken.name,
        token_type: 'erc20',
        decimals,
        is_active: true,
        gating_enabled: true,
        // Only overwrite scope when explicitly provided, so a re-run without
        // OWNER_POD_ID doesn't wipe a scope you set earlier.
        ...(ownerPodId ? { owner_pod_id: ownerPodId } : {}),
        description: tgnToken.description,
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) console.error('❌ Update failed:', error);
    else console.log('✅ Updated existing $TGN token:', updated);
  } else {
    const { data: inserted, error } = await supabase
      .from('tokens')
      .insert(tgnToken)
      .select()
      .single();
    if (error) console.error('❌ Insert failed:', error);
    else console.log('✅ Registered $TGN token:', inserted);
  }
}

registerTgnToken().catch((e) => {
  console.error('❌ Fatal:', e);
  process.exit(1);
});
