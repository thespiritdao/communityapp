# BountyManagerV3 - Quick Start Guide

## 🚀 Deploy in 5 Minutes

### 1. Compile Contract
```bash
npm run compile
```

### 2. Deploy to Base Mainnet
```bash
node scripts/deploy-bounty-manager-v3-production.cjs
```

### 3. Copy Contract Address
From deployment output:
```
✅ BountyManagerV3 deployed to: 0x...
```

### 4. Update .env
```bash
NEXT_PUBLIC_BOUNTY_MANAGER_V3_ADDRESS=0x...  # Paste address here
NEXT_PUBLIC_USE_BOUNTY_V3=true
```

### 5. Copy ABI
```bash
cp artifacts/src/contracts/BountyManagerV3.sol/BountyManagerV3.json src/abis/
```

### 6. Restart App
```bash
npm run dev
```

---

## ✅ Verify Deployment

### Check Console
Look for this log on startup:
```
🎯 Bounty System: Using V3 (Decentralized) at 0x...
```

### Test Permission Check
Open browser console and run:
```javascript
// Replace with your values
const testPodId = 'your-pod-id';
const testUser = '0x...';

fetch(`/api/bounty/permissions?user=${testUser}&pod=${testPodId}&action=manage`)
  .then(r => r.json())
  .then(console.log);
```

Expected response:
```json
{
  "canManage": true,
  "isPodRegistered": false,  // Will be true after first bounty
  "contractVersion": "V3"
}
```

---

## 🎯 Create First Bounty

### Required Info:
- **Pod ID**: From your database (e.g., `"abc-123"`)
- **Leader HAT ID**: From Hats Protocol (e.g., `0x0000008800010000000000000000000000000000000000000000000000000000`)
- **Treasury Address**: Your pod's treasury contract

### Code Example:
```typescript
const { createBountyCall } = useBountyV2();

const call = createBountyCall(
  {
    value: { amount: '100', token: 'SYSTEM' },
    podId: 'abc-123',
    title: 'Fix login bug',
    description: 'User cannot login via CDP wallet',
    deadline: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  '0x0000008800010000000000000000000000000000000000000000000000000000', // leaderHatId
  '0x...' // treasuryAddress
);

// Execute transaction
await executeTransaction(call);
```

---

## 🐛 Common Issues

### "BountyManagerV3 not deployed"
**Fix**: Check `.env` has `NEXT_PUBLIC_BOUNTY_MANAGER_V3_ADDRESS`

### "Must have leader HAT"
**Fix**: User needs to wear the pod's leader HAT
```typescript
// Check HAT ownership
const hatsContract = '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const hasHat = await hatsProtocol.balanceOf(userAddress, leaderHatId);
```

### Still using V2
**Fix**: Ensure `NEXT_PUBLIC_USE_BOUNTY_V3=true` in `.env`

---

## 📊 Key Differences from V2

| Feature | V2 (Old) | V3 (New) |
|---------|----------|----------|
| Permission Source | PodBountyService (centralized) | Hats Protocol (decentralized) |
| Pod Registration | Manual (by authorized updater) | Automatic (on first bounty) |
| Admin Check | `canManageBounties(user, podId)` | `hatsProtocol.balanceOf(user, hatId) > 0` |
| Deployment Needed | PodBountyService + BountyManager | BountyManager only |

---

## ✨ Benefits

1. **No Central Authority**: No need for authorized updaters
2. **Permissionless**: Any leader HAT holder can create bounties
3. **Automatic**: Pods register themselves on first bounty
4. **Simpler**: One less contract to manage
5. **Secure**: Leverages proven Hats Protocol

---

## 📚 Full Documentation

See [BOUNTY_V3_MIGRATION_GUIDE.md](./BOUNTY_V3_MIGRATION_GUIDE.md) for complete details.

---

## 🎉 Success!

Once deployed, your bounty system will:
- Use Hats Protocol for all permissions
- Support permissionless pod registration
- Work seamlessly with CDP embedded wallets
- Eliminate centralized bottlenecks

**Questions?** Check the migration guide or review the contract code at `src/contracts/BountyManagerV3.sol`
