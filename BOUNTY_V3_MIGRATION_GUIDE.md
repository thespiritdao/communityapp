# BountyManagerV3 Migration Guide

## 🎯 Overview

This guide covers migrating from BountyManagerV2 (centralized permissions via PodBountyService) to **BountyManagerV3** (decentralized, Hats Protocol-based permissions).

---

## 🔍 Why Migrate?

### Problems with V2:
1. **Centralized Bottleneck**: Requires `PodBountyService.sol` for permission validation
2. **Manual Registration**: Pods must be manually registered by authorized updaters
3. **Not Truly Decentralized**: Defeats the purpose of your decentralized infrastructure
4. **Doesn't Leverage Hats**: Ignores your existing Hats Protocol role system

### Benefits of V3:
1. **✅ Decentralized**: No central authority needed
2. **✅ Permissionless**: Any pod leader can register their pod for bounties
3. **✅ Hats-Native**: Uses Hats Protocol directly for permissions
4. **✅ CDP Compatible**: Works seamlessly with Coinbase Embedded Wallets
5. **✅ Auto-Registration**: Pods self-register on first bounty creation

---

## 📋 Architecture Comparison

### V2 Architecture (OLD):
```
BountyManagerV2 → PodBountyService → Manual Registration
                                  ↓
                            Centralized Auth
```

### V3 Architecture (NEW):
```
BountyManagerV3 → Hats Protocol → Automatic Permission Check
                              ↓
                        Decentralized Auth
```

---

## 🚀 Deployment Steps

### Step 1: Compile Contract
```bash
npm run compile
```

### Step 2: Deploy BountyManagerV3
```bash
node scripts/deploy-bounty-manager-v3-production.cjs
```

Expected output:
```
✅ BountyManagerV3 deployed to: 0x...
```

### Step 3: Update Environment Variables

Add to `.env`:
```bash
# BountyManagerV3 (Decentralized)
NEXT_PUBLIC_BOUNTY_MANAGER_V3_ADDRESS=0x... # From deployment
NEXT_PUBLIC_USE_BOUNTY_V3=true              # Enable V3
```

### Step 4: Generate ABI
```bash
cp artifacts/src/contracts/BountyManagerV3.sol/BountyManagerV3.json src/abis/
```

### Step 5: Verify Contract
```bash
npx hardhat verify --network base <V3_ADDRESS> 0x3bc1a0ad72417f2d411118085256fc53cbddd137
```

### Step 6: Restart Application
```bash
npm run dev
```

---

## 🔧 How V3 Works

### Permission Model

**V2 (Centralized)**:
- Pod leaders manually registered in `PodBountyService`
- `canManageBounties()` checks centralized storage
- Requires authorized updater to add/remove leaders

**V3 (Decentralized)**:
- Permission = "Do you wear the pod's leader HAT?"
- `hatsProtocol.balanceOf(user, leaderHatId) > 0`
- No manual registration needed

### Pod Registration

**V3 Auto-Registration**:
```solidity
function createBounty(..., uint256 leaderHatId, address treasuryAddress) {
    // First bounty creation for a pod?
    if (!podMetadata[podId].isRegistered) {
        // Auto-register if caller has leader HAT
        require(hatsProtocol.balanceOf(msg.sender, leaderHatId) > 0);
        podMetadata[podId] = PodMetadata({
            leaderHatId: leaderHatId,
            treasuryAddress: treasuryAddress,
            isRegistered: true,
            registeredAt: block.timestamp
        });
    }
}
```

### Flow Example

1. **User creates bounty** for pod "ABC"
2. **Contract checks**: Is pod ABC registered?
   - No → Verify user has leader HAT → Auto-register pod → Create bounty
   - Yes → Verify user has leader HAT → Create bounty
3. **Future bounties**: Already registered, just check HAT

---

## 💻 Code Changes

### Frontend Hook (Already Updated)

`src/features/bounty/hooks/useBountyV2.ts`:
- ✅ Auto-detects V3 if `NEXT_PUBLIC_BOUNTY_MANAGER_V3_ADDRESS` is set
- ✅ Falls back to V2 if V3 not deployed
- ✅ Permission checks route to V3 API endpoint

### API Endpoint (Created)

`src/app/api/bounty/permissions/route.ts`:
- New endpoint for V3 permission checks
- Reads directly from `BountyManagerV3.canManageBounties()`
- Returns HAT-based permission result

### Smart Contract (Existing)

`src/contracts/BountyManagerV3.sol`:
- Already exists and ready to deploy
- No code changes needed

---

## 🧪 Testing Checklist

### Before Deployment:
- [ ] BountyManagerV3.sol compiles without errors
- [ ] Hats Protocol address is correct for Base mainnet
- [ ] Token addresses (SYSTEM, SELF) are correct

### After Deployment:
- [ ] Contract verified on Basescan
- [ ] Environment variables updated
- [ ] ABI copied to `src/abis/`
- [ ] Application restarts successfully

### Functional Testing:
- [ ] Create bounty for NEW pod (tests auto-registration)
- [ ] Create bounty for EXISTING pod (tests permission check)
- [ ] Place bid on bounty
- [ ] Assign bounty to bidder
- [ ] Release payment
- [ ] Cancel bounty
- [ ] Verify only leader HAT holders can perform admin actions

---

## 🔐 Security Considerations

### Permission Security:
1. **HAT-Based**: All permissions derive from Hats Protocol
2. **Immutable HAT**: Pod's leader HAT ID set at registration (cannot change via V3)
3. **Treasury Access**: Only leader HAT holders can use pod treasury
4. **No Bypass**: No admin override functions (truly decentralized)

### Known Limitations:
1. **Pod Metadata Immutability**: Once registered, `leaderHatId` cannot be changed via V3
   - If pod changes leader HAT structure, must re-register under new podId
   - OR add `updatePodMetadata()` function for pod creators

2. **Treasury Address Updates**: Can only be set at registration
   - Consider adding `setTreasuryFunding()` like in V2 for flexibility

---

## 📊 Database Considerations

### V3 Does NOT Require Database Changes

The database permissions (RLS policies) remain unchanged:
- Database-level permission checks still work
- V3 adds on-chain permission verification
- Both layers provide defense-in-depth

**Why?**
- Database = source of truth for bounty data
- Blockchain = source of truth for permissions
- Separation of concerns = more secure

---

## 🐛 Troubleshooting

### "Pod not registered" error
**Solution**: First bounty creator must provide `leaderHatId` and `treasuryAddress`
```typescript
const bountyCall = createBountyCall(data, leaderHatId, treasuryAddress);
```

### "Must have leader HAT" error
**Cause**: User doesn't wear the pod's leader HAT
**Solution**: Verify HAT ownership via:
```typescript
// Check Hats Protocol directly
const hasHat = await hatsContract.balanceOf(userAddress, leaderHatId);
console.log('User has leader HAT:', hasHat > 0);
```

### "Invalid token" error
**Cause**: Token not whitelisted in contract
**Solution**: V3 only accepts SYSTEM and SELF tokens (hardcoded addresses)

### Permission check returns false
**Debug Steps**:
1. Check pod registration: `bountyManager.isValidPod(podId)`
2. Get pod metadata: `bountyManager.podMetadata(podId)`
3. Check HAT balance: `hatsProtocol.balanceOf(user, leaderHatId)`
4. Verify leader HAT ID matches pod's registered `leaderHatId`

---

## 🎓 Integration Examples

### Creating First Bounty (Auto-Registration)

```typescript
import { useBountyV2 } from '@/features/bounty/hooks/useBountyV2';

function CreateBountyForm({ podId, leaderHatId, treasuryAddress }) {
  const { createBountyCall } = useBountyV2();

  const handleCreate = async () => {
    // V3 auto-registration: provide HAT ID and treasury
    const call = createBountyCall(
      {
        value: { amount: '100', token: 'SYSTEM' },
        podId,
        title: 'Fix bug in login',
        // ... other fields
      },
      leaderHatId,      // Required for first bounty
      treasuryAddress   // Required for first bounty
    );

    // Execute via CDP embedded wallet
    await executeTransaction(call);
  };
}
```

### Checking Permissions

```typescript
const { canManageBounties } = useBountyV2();

const hasPermission = await canManageBounties(podId);
if (!hasPermission) {
  alert('You must wear the pod leader HAT to create bounties');
}
```

---

## 📝 Migration Checklist

### Pre-Migration:
- [ ] Review existing V2 bounties (will remain on V2 contract)
- [ ] Identify all pods that create bounties
- [ ] Gather leader HAT IDs for each pod
- [ ] Gather treasury addresses for each pod

### Migration Day:
- [ ] Deploy BountyManagerV3
- [ ] Update environment variables
- [ ] Deploy frontend with V3 support
- [ ] Test first bounty creation (triggers auto-registration)

### Post-Migration:
- [ ] Monitor V3 bounty creations
- [ ] Verify permission checks work correctly
- [ ] Check treasury funding functionality
- [ ] Confirm HAT-based authorization

### Long-Term:
- [ ] Consider deprecating V2 (optional)
- [ ] Add `updatePodMetadata()` if needed
- [ ] Implement enhanced treasury features

---

## 🔗 Related Documentation

- [Hats Protocol Docs](../src/features/pods/llms-full.txt)
- [BountyManagerV3 Contract](../src/contracts/BountyManagerV3.sol)
- [BountyManagerV2 Contract](../src/contracts/BountyManagerV2.sol)
- [Frontend Hook](../src/features/bounty/hooks/useBountyV2.ts)

---

## ✅ Summary

**BountyManagerV3** eliminates centralized permission bottlenecks by reading directly from Hats Protocol. This makes your bounty system:
- Truly decentralized
- Permissionless (anyone with leader HAT can create bounties)
- Simpler (no PodBountyService dependency)
- More secure (HAT-based permissions)

**Next Steps**:
1. Run deployment script
2. Update .env with V3 address
3. Test first bounty creation
4. Enjoy decentralized bounty management! 🎉
