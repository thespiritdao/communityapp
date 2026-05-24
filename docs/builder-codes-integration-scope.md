# Builder Codes Integration — Scope Document

**Date:** 2026-04-14  
**App:** SpiritDAO Community App (commapp)  
**Author:** Engineering  
**Status:** Pre-implementation scope

---

## 1. What Are Builder Codes

Builder Codes (ERC-8021) are an attribution standard on Base. When you register your app at `base.dev`, you receive a unique code (e.g. `bc_b7k3p9da`). This code is encoded into a short bytes suffix and appended to the calldata of every on-chain transaction your app sends. Smart contracts ignore the extra bytes. Off-chain indexers at Base read the suffix and credit the transaction to your app.

**What this unlocks:**
- Transaction attribution on the Base.dev dashboard (analytics)
- Eligibility for Base builder rewards programs
- App discoverability in the Base ecosystem

**What this does NOT do:**
- Modify any smart contract behavior
- Require any new contracts to be deployed
- Change gas cost meaningfully (~16 gas per non-zero byte, negligible)
- Require any user-facing changes

---

## 2. Audit Findings — Current Architecture

### 2.1 Transaction Layer

All on-chain writes in the app go through one of two paths:

| Path | Mechanism | Files |
|------|-----------|-------|
| **Primary** | `useSendUserOperation()` from `@coinbase/cdp-hooks` | `ClaimTab.tsx`, `BidForm.tsx`, `OnboardingHatMinting.tsx`, `FundingModal.tsx`, etc. |
| **Secondary** | OnchainKit `<Transaction>` components backed by the `coinbaseWallet` wagmi connector | Some admin/proposal flows |

`useSendUserOperation` is the CDP SDK's own hook — it does **not** route through wagmi's `useSendTransaction`. This is the critical distinction.

### 2.2 Wagmi Config

`src/config/wagmi.client.ts` — `createConfig` with `coinbaseWallet` connector and fallback RPC transports. **No `dataSuffix` currently set.**

The docs state that adding `dataSuffix` to `createConfig` auto-applies it to all wagmi-routed transactions (`useSendTransaction`, `useSendCalls`). However, CDP's `useSendUserOperation` is **not** a wagmi hook and will not pick up the wagmi-level `dataSuffix` automatically.

### 2.3 Viem Version

Current: `viem ^2.33.3`. Required for Builder Codes: **viem 2.45.0+**.  
This is a **blocking dependency** that must be resolved before any integration work.

### 2.4 `ox` Library

The `Attribution.toDataSuffix()` function used to generate the suffix comes from the `ox` library. It is **not currently in package.json**. Needs to be added.

### 2.5 Paymaster Proxy

`src/app/api/paymaster/route.ts` — a custom ERC-7677 paymaster proxy that decodes UserOperation calldata to find the true target contract and approve/deny sponsorship. It forwards approved requests to Coinbase's paymaster upstream.

This proxy operates on **ERC-4337 UserOperation calldata** (the `execute`/`executeBatch` wrapper). The `dataSuffix` is appended to the inner call's data, inside the wrapper — the paymaster proxy decodes to the target address level, not to the inner call data. **The suffix does not interfere with paymaster logic.**

### 2.6 CDP `useSendUserOperation` — dataSuffix Support

The CDP hooks SDK (`@coinbase/cdp-hooks`) does **not** currently expose a `dataSuffix` config option in the same way wagmi does. This is the main complexity of this integration. Two options exist (detailed in Section 4).

---

## 3. Risk Assessment

| Risk | Severity | Notes |
|------|----------|-------|
| Viem upgrade from 2.33 → 2.45+ | Medium | Semver minor, but must test all viem call sites. Wagmi, CDP SDK, and OnchainKit all peer-depend on viem — check compatibility matrix before upgrading. |
| `dataSuffix` corrupting calldata | Low | ERC-8021 appends after the ABI-encoded payload. Contracts decode only their ABI portion. The suffix is ignored. Verified by the standard and block explorer inspection. |
| Paymaster rejecting operations with suffix | Low | The paymaster proxy decodes `execute(target, value, data)` — it reads `target`, not `data`. The suffix is inside `data`. No interference. |
| CDP `useSendUserOperation` not supporting suffix natively | Medium | Requires a wrapper hook or manual calldata mutation. See Option B in Section 4. |
| Breaking existing transaction flows | Low-Medium | Contained to wagmi config and one utility hook. No component changes required. |
| Attribution missing for some tx types | Low | If we only patch the wagmi layer, CDP-routed ops won't carry the suffix. Acceptable as partial rollout; document the gap. |

**No changes to any smart contract, database schema, or API routes are required.**

---

## 4. Integration Options

### Option A — Wagmi Config Only (Low Risk, Partial Coverage)

**Scope:** Single-file change. Add `dataSuffix` to `createConfig` in `wagmi.client.ts`.  
**Coverage:** Only transactions routed through wagmi (`useSendTransaction`, `useSendCalls`, OnchainKit `<Transaction>` components).  
**Excludes:** `useSendUserOperation` calls (the majority of app transactions).

```ts
// src/config/wagmi.client.ts
import { Attribution } from 'ox/erc8021';

const DATA_SUFFIX = Attribution.toDataSuffix({
  codes: [process.env.NEXT_PUBLIC_BUILDER_CODE!],
});

export const wagmiConfig = createConfig({
  chains: [base],
  dataSuffix: DATA_SUFFIX,   // ← add this one line
  transports: { ... },
  connectors: [ ... ],
  ssr: true,
});
```

**Pros:** Surgical, zero risk to CDP transaction path.  
**Cons:** Attribution is incomplete — most user operations won't carry the code.

---

### Option B — CDP Path + Wagmi Config (Full Coverage, Recommended)

**Scope:** `wagmi.client.ts` (Option A) + a thin `useSendUserOperationWithAttribution` wrapper hook.

Because `useSendUserOperation` takes a `data` field on each call, we can append the suffix to the calldata at the call site via a wrapper hook. This requires no changes to the CDP SDK.

```ts
// src/wallet/hooks/useSendUserOperationWithAttribution.ts
import { useSendUserOperation } from '@coinbase/cdp-hooks';
import { Attribution } from 'ox/erc8021';
import { concat } from 'viem';

const DATA_SUFFIX = Attribution.toDataSuffix({
  codes: [process.env.NEXT_PUBLIC_BUILDER_CODE!],
}) as `0x${string}`;

export function useSendUserOperationWithAttribution() {
  const { sendUserOperation, ...rest } = useSendUserOperation();

  const sendWithAttribution = async (params: Parameters<typeof sendUserOperation>[0]) => {
    const patched = {
      ...params,
      data: params.data
        ? concat([params.data as `0x${string}`, DATA_SUFFIX])
        : DATA_SUFFIX,
    };
    return sendUserOperation(patched);
  };

  return { sendUserOperation: sendWithAttribution, ...rest };
}
```

Then replace `useSendUserOperation` imports in transaction-sending components with `useSendUserOperationWithAttribution`.

**Files to update (transaction senders):**

| File | Current import |
|------|---------------|
| `src/app/claims/ClaimTab.tsx` | `useSendUserOperation` |
| `src/features/bounty/components/BidForm.tsx` | `useSendUserOperation` |
| `src/features/bounty/components/BidApprovalFlow.tsx` | `useSendUserOperation` |
| `src/app/admin/bulk-events/page.tsx` | `useSendUserOperation` |
| `src/components/OnboardingHatMinting.tsx` | `useSendUserOperation` |
| `src/components/FundingModal.tsx` | `useSendUserOperation` |
| `src/app/proposals/page.tsx` | `useSendUserOperation` |

**Pros:** Full attribution coverage across all transaction paths.  
**Cons:** Requires verifying that the CDP bundler/paymaster does not reject the extra bytes. Test on testnet first.

---

## 5. Recommended Approach

**Phase 1 — Prerequisites (no app changes, no deploy risk)**

1. Register the app at `base.dev` → obtain builder code
2. Add `NEXT_PUBLIC_BUILDER_CODE=bc_xxxxxxxx` to `.env` and Vercel environment variables
3. Upgrade `viem` to `^2.45.0` — run locally, verify build passes, check CDP/wagmi/OnchainKit peer dep compatibility
4. Add `ox` package: `npm install ox`

**Phase 2 — Wagmi Layer (Option A, safe first step)**

1. Add `dataSuffix` to `wagmi.client.ts` (3 lines of code)
2. Deploy and verify attribution appears on `base.dev` dashboard for any OnchainKit `<Transaction>` flows
3. Use the [Builder Code Validation Tool](https://builder-code-checker.vercel.app/) with a test transaction hash

**Phase 3 — CDP Layer (Option B, full coverage)**

1. Create `src/wallet/hooks/useSendUserOperationWithAttribution.ts`
2. Swap imports in the 7 files listed above (grep-and-replace)
3. Test on a staging deploy: execute one transaction from each flow, verify on block explorer that input data ends with the `8021` pattern
4. Deploy to production

---

## 6. Files Touched (Full Coverage Path)

| File | Change | Risk |
|------|--------|------|
| `package.json` | Add `ox` dep, bump `viem` to `2.45.x` | Low — semver compatible |
| `.env` / Vercel env | Add `NEXT_PUBLIC_BUILDER_CODE` | Zero |
| `src/config/wagmi.client.ts` | Add `dataSuffix` to `createConfig` | Very low |
| `src/wallet/hooks/useSendUserOperationWithAttribution.ts` | **New file** — wrapper hook | Low |
| `src/app/claims/ClaimTab.tsx` | Swap hook import | Low |
| `src/features/bounty/components/BidForm.tsx` | Swap hook import | Low |
| `src/features/bounty/components/BidApprovalFlow.tsx` | Swap hook import | Low |
| `src/app/admin/bulk-events/page.tsx` | Swap hook import | Low |
| `src/components/OnboardingHatMinting.tsx` | Swap hook import | Low |
| `src/components/FundingModal.tsx` | Swap hook import | Low |
| `src/app/proposals/page.tsx` | Swap hook import | Low |

**No changes to:**
- Smart contracts
- Database schema or migrations
- API routes (including paymaster proxy)
- Auth flows
- Provider stack (`CDPEmbeddedProvider`, `Providers.tsx`)
- Any read-only hooks or components

---

## 7. Verification Checklist

Before declaring integration complete:

- [ ] `base.dev` dashboard shows attribution count incrementing
- [ ] Block explorer shows last bytes of input data contain `8021` pattern on at least one transaction from each flow
- [ ] [Builder Code Checker](https://builder-code-checker.vercel.app/) validates a transaction hash
- [ ] Paymaster still sponsors operations (no regression in gasless flow)
- [ ] All 7 transaction-sending components still function correctly end-to-end
- [ ] No console errors in production relating to `dataSuffix` or calldata encoding

---

## 8. What This Does NOT Require

To be explicit, the following are **not needed** and **should not be done** for this integration:

- No new smart contracts
- No changes to Hats Protocol hat IDs or pod architecture
- No changes to the paymaster proxy logic
- No new database tables or columns
- No changes to auth, JWT, or Supabase RLS
- No new API routes
- No changes to governance, bounty, or pod creation flows beyond the hook swap
- No user-facing UI changes

---

## 9. Open Questions Before Starting

1. **Viem peer dep compatibility**: Before upgrading viem to 2.45+, confirm `@coinbase/cdp-hooks@0.0.73`, `@coinbase/onchainkit@0.38.17`, and `wagmi@2.15.6` all accept viem 2.45.x as a peer. Check each package's peerDependencies.

2. **CDP bundler tolerance**: Verify the Coinbase ERC-4337 bundler does not reject UserOperations where the inner call `data` field has extra bytes appended (the suffix). This is expected to work per the ERC-8021 spec, but should be confirmed on testnet before production rollout.

3. **Builder Code value**: The `NEXT_PUBLIC_BUILDER_CODE` env var value comes from registering at `base.dev`. This must be done before any code is written.
