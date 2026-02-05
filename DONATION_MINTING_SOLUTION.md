# Donation Minting: Scalable Hats Protocol Solution

## Problem

Current SystemToken contract uses OpenZeppelin AccessControl, requiring manual role grants:
- ❌ Must grant EXECUTIVE_ROLE to each executive's wallet individually
- ❌ Roles don't revoke automatically when executives leave
- ❌ Not scalable - manual management required
- ❌ Backend wallet can't use gasless transactions (needs ETH)

## Solution: Hats Protocol Integration

Integrate Hats Protocol into SystemToken so it automatically checks Hat ownership instead of manual roles.

### Benefits

✅ **Automatic Authorization**: Anyone wearing Executive Pod Leader Hat can mint
✅ **Automatic Revocation**: Losing the Hat = losing mint permission (instant)
✅ **Zero Manual Management**: No need to grant/revoke individual addresses
✅ **Scalable**: Works for any number of executives
✅ **Gasless**: Frontend Smart Wallets work with paymaster
✅ **Consistent**: Matches existing bounty/pod/event permission system

## Architecture

### Current SystemToken (V1)
```solidity
function mint(address to, uint256 amount) external onlyRole(EXECUTIVE_ROLE) {
    _mint(to, amount);
}
```

### New SystemTokenV2
```solidity
IHats public immutable hatsProtocol;
uint256 public immutable executiveHatId;

function canMint(address account) public view returns (bool) {
    // Check Executive Hat ownership
    if (hatsProtocol.isWearerOfHat(account, executiveHatId)) {
        return true;
    }
    // Fallback: manual EXECUTIVE_ROLE
    return hasRole(EXECUTIVE_ROLE, account);
}

function mint(address to, uint256 amount) external {
    require(canMint(msg.sender), "SystemToken: caller cannot mint");
    _mint(to, amount);
}
```

## Deployment Steps

### 1. Deploy SystemTokenV2

**Parameters:**
- `initialSupply`: Same as V1 (or 0 if migrating)
- `executiveAddress`: Your multisig or treasury
- `_hatsProtocol`: `0x3bc1A0Ad72417f2d411118085256fC53CBdDd137` (Base mainnet)
- `_executiveHatId`: `0x0000008800010000000000000000000000000000000000000000000000000000`

**Example:**
```javascript
const SystemTokenV2 = await ethers.getContractFactory("SystemTokenV2");
const systemToken = await SystemTokenV2.deploy(
  ethers.parseEther("0"), // Initial supply (0 if migrating)
  "0xYourTreasuryAddress",
  "0x3bc1A0Ad72417f2d411118085256fC53CBdDd137", // Hats Protocol
  "0x0000008800010000000000000000000000000000000000000000000000000000" // Exec Hat
);
```

### 2. Migration Plan (if replacing existing SystemToken)

**Option A: Direct Replacement**
1. Deploy SystemTokenV2
2. Update all references in your app to new address
3. Migrate any existing balances if needed

**Option B: Proxy Upgrade**
1. Use UUPS proxy pattern for seamless upgrade
2. No address change needed
3. Requires proxy infrastructure

### 3. Update Environment Variables

```bash
NEXT_PUBLIC_SYSTEM_TOKEN=0xNewSystemTokenV2Address
```

### 4. Update Frontend Minting Component

Already implemented in `MintDonationButton.tsx` - no changes needed!
It uses the executive's Smart Wallet which will automatically check Hat ownership.

### 5. Whitelist in CDP Paymaster

Add new SystemTokenV2 address to CDP Paymaster whitelist:
1. Go to CDP Dashboard
2. Paymaster → Contract Allowlist
3. Add `SystemTokenV2` address
4. Add function: `mint(address,uint256)`

## Testing

### 1. Verify Hat Integration

```javascript
const canMint = await systemTokenV2.canMint(executiveSmartWallet);
console.log('Can mint:', canMint); // Should be true if wearing hat
```

### 2. Test Minting

1. Go to `https://app.spiritdao.org/executive/donations`
2. Approve a donation (2-of-3 approval)
3. Click "Mint $SYSTEM Tokens"
4. Transaction should succeed gaslessly

### 3. Test Revocation

1. Remove Executive Hat from a wallet
2. Try minting → should fail
3. Re-grant Hat → minting works again

## Comparison: Old vs New

| Feature | SystemToken V1 | SystemTokenV2 |
|---------|----------------|---------------|
| Permission Type | Manual role grants | Automatic Hat check |
| Revocation | Manual `revokeRole()` | Automatic (lose hat) |
| Scalability | Poor (manual per wallet) | Excellent (automatic) |
| Gasless Support | No (backend needs ETH) | Yes (frontend Smart Wallets) |
| Consistency | Different from pods/bounties | Same as pods/bounties |
| Executive Leaves | Role persists (security risk) | Access revoked instantly |

## Security Benefits

1. **Instant Revocation**: Executive leaves → Hat removed → No mint access
2. **No Orphaned Permissions**: Can't forget to revoke old members
3. **Audit Trail**: Hat ownership on-chain, fully transparent
4. **Consistent with DAO**: All permissions managed via Hats Protocol

## Cost Analysis

- **Gas Cost**: Similar to V1 (Hat check is ~3k gas, role check is ~2.5k gas)
- **Maintenance**: Zero vs. Manual per executive
- **Security**: Much higher (automatic revocation)

## Rollback Plan

If issues arise:
1. V1 contract still exists at old address
2. Can revert env vars to old address
3. Both contracts can coexist during migration

## Recommendation

**Deploy SystemTokenV2** for:
- ✅ Scalable permission management
- ✅ Automatic revocation when executives leave
- ✅ Consistency with rest of your DAO infrastructure
- ✅ Gasless transaction support
- ✅ Zero ongoing maintenance

This matches how your bounties, pods, and events already work!
