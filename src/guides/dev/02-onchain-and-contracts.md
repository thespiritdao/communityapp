# On-Chain & Contracts (Developer Documentation)

> **Audience:** developers, integrators, and technical evaluators.
>
> **Scope note:** This is public-safe documentation. It describes the on-chain
> stack, the gasless write pattern, and the public contract registry (all
> addresses are already public and verifiable on Basescan). It deliberately omits
> security-sensitive internals (RLS policy details, exact authorization-gate
> logic, secret values).

---

## Chain & libraries

Everything settles on **Base** (Ethereum L2). The client stack is **viem**,
**wagmi**, and **OnchainKit**. User wallets are **ERC-4337 smart wallets** (see
`01-identity-and-auth.md`), which is what makes gasless writes possible.

| Concern | Technology |
|---------|-----------|
| Chain | Base (L2) |
| RPC / encoding | viem |
| React hooks | wagmi |
| Wallet UX | OnchainKit |
| Accounts | ERC-4337 smart wallets |
| Gas sponsorship | Coinbase Paymaster |
| Roles | Hats Protocol (ERC-1155) |

---

## Hats Protocol is the role primitive

Roles (pod leader, member, executive, moderator, treasurer) are **Hats
Protocol** tokens (ERC-1155). Authorization almost always reduces to "does this
wallet wear the right hat?"

Hat IDs are **resolved from the database**, specifically
`pod_role_permissions.token_address`, **not** from environment variables and not
from a hardcoded registry. A hat tree can therefore be redeployed and the app
picks up new IDs by updating one table.

- Resolution is **cached (~5 minutes)**.
- It is exposed publicly via **`GET /api/hat-registry`** (no auth, used at boot).
- The current **top hat tree id is `0x00000749`**.

---

## The gasless write triad: authorize → sendUserOperation → dbUpdate

Every on-chain write that also touches the database follows the same three
steps:

1. **authorize**: the server verifies the caller is permitted (e.g. wears the
   required hat) and returns the calldata to execute.
2. **sendUserOperation**: the **client's** smart wallet submits the
   UserOperation; gas is sponsored by the Coinbase Paymaster.
3. **dbUpdate**: the server records the result in Supabase, keyed by the
   transaction hash.

**The rule:** on-chain writes go through the **caller's smart wallet, never an
admin EOA**. Only smart wallets can use the paymaster, and using the caller's
own wallet keeps authorship and authorization honest. An admin EOA both can't be
sponsored and would misattribute the action.

**Paymaster operational note:** the Coinbase Paymaster enforces an **allowlist**.
Any **new contract** (and any **new function signature** on an existing one)
must be registered in the paymaster allowlist before its UserOperations will be
sponsored. A write that "silently fails to send" is most often an unallowlisted
target.

---

## Contract registry (Base mainnet)

These are the canonical deployments. Each is wired to the app through the named
environment variable. **Addresses are truncated here**; the full values live in
the app's env config and are verifiable on **Basescan**.

| Env var | Address | Purpose |
|---------|---------|---------|
| `NEXT_PUBLIC_HATS_CONTRACT` | `0x3bc1a0…` | Hats Protocol core (ERC-1155 roles) |
| `NEXT_PUBLIC_HAT_MINTER` | `0x5F8a93…` | HatMinter: mints membership / role hats |
| `NEXT_PUBLIC_HATS_MODULE_FACTORY_ADDRESS` | `0xfE661c…` | Hats module factory |
| `NEXT_PUBLIC_POD_CREATION_MANAGER` | `0x086eD4…` | PodCreationManagerV2: permissionless pod proposals; holds the `COMMUNITY_PODS_PARENT` hat |
| `NEXT_PUBLIC_POD_CREATION_MANAGER_FACTORY` | `0x18B947…` | factory for pod-creation managers |
| `NEXT_PUBLIC_TREASURY_PROXY` | `0x02110b…` | treasury proxy |
| `NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS` | `0x7b3d75…` | BountyManagerV4 |
| `NEXT_PUBLIC_PROOF_OF_CURIOSITY` | `0xAD6544…` | ProofOfCuriosity: soulbound ERC-721 membership credential |
| `NEXT_PUBLIC_ADVOCATE` | `0x3f0A79…` | AdvocateV2: governance NFT (ERC721Votes, auto-delegates on mint) |
| `NEXT_PUBLIC_SYSTEM_TOKEN` | `0x00f757…` | SystemToken: transferable ERC-20, fiat-backed ($SYSTEM) |
| `NEXT_PUBLIC_SELF_EPOCHS` | `0x169760…` | SelfEpochs V2: soulbound ERC-1155 $SELF |
| `NEXT_PUBLIC_SELF_MINTER` | `0xDcD71c…` | SelfMinter: mints $SELF against attested actions |
| `NEXT_PUBLIC_SELF_PAYMENT` | `0x3eac92…` | SelfPayment: burn-to-pay + receipt issuance |
| `NEXT_PUBLIC_SELF_RECEIPT` | `0x2aeB8C…` | SelfReceipt: soulbound redemption receipts |
| `NEXT_PUBLIC_SELF_PRESTIGE` | `0x133dB7…` | SelfPrestige: Tenure standing (tier + lifetime hours) |
| `NEXT_PUBLIC_SELF_TOKEN` | `0x2d9e8A…` | **RETIRED / legacy**: the old transferable ERC-20 $SELF (superseded by SelfEpochs) |

> **$SELF generations:** `NEXT_PUBLIC_SELF_TOKEN` is the **retired** ERC-20
> $SELF. The live $SELF is the soulbound ERC-1155 **SelfEpochs** stack
> (`SELF_EPOCHS` / `SELF_MINTER` / `SELF_PAYMENT` / `SELF_RECEIPT` /
> `SELF_PRESTIGE`). New work should never reference the retired token.

---

## Soulbound vs. transferable, at a glance

- **Transferable:** `SYSTEM_TOKEN` (capital-backed utility ERC-20).
- **Soulbound:** `PROOF_OF_CURIOSITY` (ERC-721 membership) and the **$SELF**
  stack (ERC-1155). "Paying" with $SELF means **burning** it via `SelfPayment`,
  not transferring it.

See `03-tokens-and-treasury.md` for the full token economics.

---

## Advocate governance NFT (auto-delegating)

`AdvocateV2` (`NEXT_PUBLIC_ADVOCATE`) is an **ERC721Votes** governance NFT that
**auto-delegates on mint**: `mint` / `batchMint` call `_delegate(recipient,
recipient)` internally, so a new holder's voting power is **live immediately**.
There is **no separate self-delegation transaction** on the live mint path. The
mint route `POST /api/onboarding/mint-advocate` relies on this behavior.

> Caveat: only holders minted under the **legacy V1** contract would need a
> manual `delegate` call. The current mint path is V2, which self-delegates
> automatically.

---

## Where the code lives

| Artifact | Location |
|----------|----------|
| Contract source | `src/contracts/` |
| Treasury deploy sources | `src/contracts/treasury-deploy/` |
| ABIs | `src/abis/` |

---

## Where to go next

- **`00-architecture-overview.md`**: the whole-app map and cross-cutting patterns
- **`01-identity-and-auth.md`**: the wallet that signs these UserOperations
- **`03-tokens-and-treasury.md`**: $SYSTEM, $SELF (epochs, decay, Tenure), burn-to-pay
- **`04-governance-and-pods.md`**: hat resolution, pod lifecycle, the 3-tier model
