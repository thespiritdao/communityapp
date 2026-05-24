# Paymaster & Gas Sponsorship

*Last updated: 2026-05-23*

The app sponsors gas for nearly every user-facing on-chain action.
This doc explains how, what's whitelisted, and the architectural
decision behind the proxy.

## The problem CDP's paymaster doesn't solve

Coinbase's CDP paymaster sponsors gas for transactions targeting a
**statically configured whitelist** of contracts. You manage the
list in the CDP dashboard.

This works perfectly for protocol contracts: HatsProtocol, the
HatMinter, the Treasury Proxy admin, etc. These have stable addresses.

It does NOT work for **per-pod contracts** that get deployed
dynamically as pods are created:

- `PodCreationManagerV2` instances — one per pod, deployed on
  pod activation
- `PodTreasuryV3` proxies — one per pod treasury, deployed on
  treasury enablement

Their addresses don't exist until the deploy transaction lands. You
can't pre-whitelist them, and CDP's dashboard doesn't expose a
programmatic API to add them after the fact (or didn't, when we built
this).

## The proxy

`src/app/api/paymaster/route.ts` is an ERC-7677-compliant paymaster
proxy. The client points `paymasterUrl: '/api/paymaster'` at it when
sending UserOperations that target dynamic pod contracts. For
statically-whitelisted contracts, the client uses
`useCdpPaymaster: true` and bypasses the proxy entirely.

```
Client (sendUserOperation)
   │
   ├── useCdpPaymaster: true  ───►  CDP paymaster directly
   │                                 (static whitelist applies)
   │
   └── paymasterUrl: '/api/paymaster'
                      │
                      ▼
       /api/paymaster (this proxy)
                      │
                      ├── Decode callData → extract targets
                      ├── For each target:
                      │     ─ in STATIC_WHITELIST? OK
                      │     ─ matches pods.creation_manager_address? OK
                      │     ─ matches pods.treasury_contract_address? OK
                      │     ─ else: deny (-32003)
                      │
                      └── If all OK, forward to upstream CDP paymaster
```

## How target extraction works

UserOperations from smart accounts encode the *real* target inside
`callData`, wrapped in either `execute(target, value, data)` or
`executeBatch(calls[])`. The proxy decodes both formats (plus the
unnamed-fields variant Coinbase Smart Accounts use) to find what the
user is actually trying to call.

If decoding fails on all three ABIs, the proxy **denies sponsorship**.
This is fail-closed by design — sponsoring a request we can't
introspect would defeat the purpose.

## The static whitelist

Defined at the top of `paymaster/route.ts`:

```typescript
const STATIC_WHITELIST = new Set<string>(
  [
    process.env.NEXT_PUBLIC_POD_CREATION_MANAGER,
    process.env.NEXT_PUBLIC_POD_CREATION_MANAGER_FACTORY,
    process.env.NEXT_PUBLIC_HATS_MODULE_FACTORY_ADDRESS,
    process.env.NEXT_PUBLIC_HATS_CONTRACT,
    process.env.NEXT_PUBLIC_HAT_MINTER,
    process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS,
    process.env.NEXT_PUBLIC_TREASURY_PROXY,
    // Hardcoded exec + TN pod treasuries (needed for migration)
    '0x0b76fdf7afa6c38ba0a99aa95b8899631335e70b',
    '0xf2d28ba2c110c415cd75824f1e390ea807793bac',
  ]
    .filter(Boolean)
    .map((a) => a!.toLowerCase()),
);
```

**Keep this in sync with the CDP dashboard whitelist.** The proxy's
static set is a duplicate of CDP's — duplicated because the proxy
needs to make sponsorship decisions before forwarding to CDP, and
CDP's whitelist isn't queryable.

## The dynamic check

For any target not in the static set, the proxy does a single DB
lookup:

```sql
SELECT id FROM pods
WHERE creation_manager_address ILIKE <target>
   OR treasury_contract_address ILIKE <target>
LIMIT 1;
```

If a matching pod row exists, the contract is approved. This means
**any deployed pod manager or treasury is automatically gas-sponsored**
without any human whitelist action.

The case-insensitive comparison is intentional: viem returns
checksummed addresses from decoded events, while the proxy lowercases
the target.

## When to use the proxy vs CDP directly

| Use this | When |
|---|---|
| `useCdpPaymaster: true` | Calling a contract that's in the CDP dashboard whitelist (Hats, the hat minter, the bounty manager, etc.) |
| `paymasterUrl: '/api/paymaster'` | Calling a per-pod contract (PodCreationManagerV2 instance, PodTreasuryV3 proxy) |

If you're unsure, the proxy is the safer default — it'll forward to
CDP for whitelisted contracts anyway, just with an extra DB query.

## Adding a new contract type to dynamic sponsorship

If we ship a new per-pod contract type (e.g. PodGovernanceV2 per-pod
deployments), update the dynamic check:

1. Store the new contract address on the `pods` row (or a new table).
2. Add another `.or(...)` clause in `willSponsor`'s DB query.
3. No CDP dashboard changes required.

For a new globally-deployed contract:

1. Add it to the CDP dashboard whitelist.
2. Add it to `STATIC_WHITELIST` in this file.
3. Use `useCdpPaymaster: true` from the client.

## Operational notes

- **Failure mode:** if the upstream CDP paymaster returns an error,
  the proxy forwards it verbatim. Common cause: a sponsored UserOp
  exceeds the daily limit on the CDP account.
- **Cost:** each request to the proxy does one DB read. Cache-friendly
  (could be added) but DB is fast enough today.
- **Auth:** the proxy is unauthenticated. Anyone can ask if a contract
  is sponsored. This is fine because sponsorship is gated by contract
  address, not by caller identity — if you can call the contract, you
  can already get sponsored.
- **Logging:** denied sponsorships log to console with the target
  address. Useful when debugging "my transaction reverted with
  paymaster error."

## File map

| Path | Role |
|---|---|
| `src/app/api/paymaster/route.ts` | The proxy |
| `src/wallet/hooks/useSendUserOperationWithAttribution.ts` | Wrapped CDP hook with Builder Codes attribution + paymaster routing |
| `vercel.json` | (No cron config — proxy is request/response only) |

## Related docs

- `builder-codes-integration-scope.md` — ERC-8021 attribution layered
  on top of every sponsored transaction.
- `pods-architecture-overview.md` — how per-pod contract addresses
  land in the pods table in the first place.
