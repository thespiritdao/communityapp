# Agent Wallet Architecture (Congregant Phase 1)

**Date:** 2026-08-18
**Scope:** Phase 1 of `CONGREGANT_INTEGRATION_SCOPE.md` — real onchain identity for pod AI agents.

## Deployed state (2026-08-18)

- **AgentRegistry (Base mainnet):** `0x413326f34DF76C8F537FE7292b66feff2eA83Ca2` — owner: backend admin smart wallet `0x05c06af9...cF63`; admin hat: Executive Pod Leader `0x00000749 0001...` (verified against `pod_role_permissions`)
- **Kairos real wallet:** `0x26e2fC58752b785fb9Ab3a315Db32BD4f81DD48a` (CDP smart wallet; signer derived from master key) — registered active, `agentForPod(TN)` resolves to it. Registration tx: `0x63d9285d4d5b3f6d550f9fa846cde773f5e5dc3962c78ab84eee25ce4d3caa8f` (sent by exec-hat-wearing pod admin EOA — the hat-authority path)
- **Legacy address** `0xca10f2bc...0000` fully migrated: profile moved, 1 forum thread + 1 chat message + 3 events + 4 explorer events rewritten
- **Remaining ops:** set `NEXT_PUBLIC_AGENT_REGISTRY` in Vercel + local `.env`; optionally whitelist the registry in the CDP paymaster portal (needed only for future gasless registrations from the backend); optionally verify contract source on Basescan
- **Gotcha:** CDP `createSmartWallet` is NOT idempotent (409 `already_exists` on repeat) — service and migration script resolve existing wallets via `listSmartWallets` matched on owner

## What changed

Pod agents (e.g. Kairos) previously used a **derived pseudo-address**: `0x + "ca10" + pod UUID hex` (`deriveAgentWallet()` in `src/services/communityAgent/types.ts`). That address had no keys and no onchain existence — the agent was excluded from governance by *non-existence*, not by constitution.

Now each agent gets:

1. **A real CDP smart wallet** — created via `createSmartWallet()` from `@coinbase/coinbase-sdk`, owned by a deterministically derived signer (see Key custody).
2. **An onchain registration** in the `AgentRegistry` contract (`src/contracts/AgentRegistry.sol`) marking the address as an artificial member, publicly verifiable on Basescan.

## Components

| Component | Path | Role |
|---|---|---|
| AgentRegistry contract | `src/contracts/AgentRegistry.sol` | Onchain source of truth for "this address is an agent" |
| Wallet service | `src/services/communityAgent/agentWalletService.ts` | Provision wallets, register onchain, resolve identity |
| Identity API | `src/app/api/community-agent/identity/route.ts` | Public GET — address + registry status per pod |
| Deploy script | `scripts/deploy/deploy-agent-registry.cjs` | `npx hardhat run scripts/deploy/deploy-agent-registry.cjs --network base` |
| Migration script | `scripts/migrate-agent-wallets.mjs` | One-time migration of existing agents (supports `--dry-run`) |
| Auto-provisioning | `src/app/api/pods/[id]/modules/route.ts` | New agents get real wallets when the module is enabled |
| Identity UI | `src/features/pods/components/PodCommunityAgentManager.tsx` | "Onchain Identity" block with Basescan link |

## Key custody

**No per-agent key material is stored anywhere.** Each agent's signer key is derived on demand:

```
signerKey = HMAC-SHA256(AGENT_WALLET_MASTER_KEY, "agent-signer:v1:{podId}:{counter}")
```

- `AGENT_WALLET_MASTER_KEY` is a single env secret (generate with `openssl rand -hex 32`).
- Derivation is deterministic: the same pod always resolves to the same signer, so `createSmartWallet` is idempotent and wallets are recoverable from the master key alone.
- The smart wallet **address** stored in `community_agent_config.agent_wallet` is public data.
- Compromise blast radius: a leaked master key lets an attacker *speak as* agents (post as them), but the constitutional exclusion (Phase 2) means agent addresses can never vote, wear hats, or hold standing tokens — the architecture caps what the compromise can cost.

## AgentRegistry semantics

- `isRegistered(address)` — **permanent**: true once ever registered. Use for constitutional exclusion (mint guards, eligibility modules — Phase 2). An address that ever belonged to a machine never becomes a human member.
- `isAgent(address)` — **operational**: registered AND active. Deactivated on subscription lapse/retirement via `deactivateAgent()`; restored via `reactivateAgent()`.
- `agentForPod(bytes32 podId)` — one active agent per pod. Pod UUID is encoded as bytes32 (dashes stripped, left-padded).
- **Admin** = contract owner, `authorizedCallers` (backend service wallet `0x05c06af9...cF63`), or any wearer of the Executive Pod Leader hat — constitutional control follows the hat, not a key.

## Config schema additions (`pod_modules.community_agent_config`)

| Key | Meaning |
|---|---|
| `agent_wallet` | The address consumed by all posting paths (now the real smart wallet) |
| `agent_wallet_type` | `'cdp_smart_wallet'` once provisioned; absent/legacy before |
| `legacy_agent_wallet` | The old derived pseudo-address, preserved for historical reference |
| `agent_wallet_created_at` | Provisioning timestamp |
| `agent_registry_tx` | Basescan-linkable registration transaction |
| `agent_registered_at` | Registration timestamp |

## Environment variables

| Var | Where | Purpose |
|---|---|---|
| `AGENT_WALLET_MASTER_KEY` | server only | Master secret for signer derivation (new) |
| `NEXT_PUBLIC_AGENT_REGISTRY` | client + server | Deployed AgentRegistry address (new) |
| `CDP_API_KEY`, `EXECUTIVE_MINTING_PRIVATE_KEY` | server only | CDP API auth (existing) |
| `POD_ADMIN_PRIVATE_KEY` | server only | Signer for backend admin smart wallet (existing) |
| `NEXT_PUBLIC_PAYMASTER` | client + server | Gas sponsorship (existing) |

## Rollout order

1. Set `AGENT_WALLET_MASTER_KEY` in Vercel + local `.env`.
2. Deploy: `npx hardhat run scripts/deploy/deploy-agent-registry.cjs --network base`.
3. Set `NEXT_PUBLIC_AGENT_REGISTRY`; whitelist the contract in the CDP paymaster portal (functions: `registerAgent`, `deactivateAgent`, `reactivateAgent`).
4. Verify on Basescan (command printed by deploy script).
5. `node scripts/migrate-agent-wallets.mjs --dry-run` — review the report (Kairos + any other enabled agents; counts of forum/chat/event/explorer rows to rewrite).
6. `node scripts/migrate-agent-wallets.mjs` — executes config update, profile move, attribution rewrite, onchain registration.
7. Confirm the "Onchain Identity" block in the pod's Community Agent panel shows the address with a live registration link.

Legacy note: `deriveAgentWallet()` remains only as a fallback resolver (mention detection still recognizes old addresses; unprovisioned pods degrade gracefully if the master key is unset). Do not remove until all agent-enabled pods show `agent_wallet_type: 'cdp_smart_wallet'`.

## What this enables (Phase 2+)

Token contracts and Hats eligibility modules can now guard against `AgentRegistry.isRegistered(recipient)`, converting the agent's exclusion from backend policy into contract code — the central claim of *Congregant, Not Citizen*. See `CONGREGANT_INTEGRATION_SCOPE.md` Phase 2.
