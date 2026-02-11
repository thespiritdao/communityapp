# Final Testing Checklist

## Pre-Deployment Verification

Before deploying to production, verify all previous steps:

- [ ] PurchaseRouter state exported (Phase 1)
- [ ] SystemTokenV2 deployed to mainnet (Phase 3)
- [ ] TokenFaucet redeployed (Phase 3)
- [ ] PurchaseRouter redeployed (Phase 3)
- [ ] PurchaseRouterDecentralized redeployed (Phase 3)
- [ ] PurchaseRouter state migrated (Phase 4)
- [ ] BountyManagerV4 updated (Phase 5)
- [ ] EventManager updated (Phase 5)
- [ ] CDP Paymaster whitelist updated (Phase 6)
- [ ] Environment variables updated locally (Phase 6)
- [ ] Environment variables updated in Vercel (Phase 6)

## Step 13: Deploy Frontend to Vercel

### Option A: Via Vercel Dashboard

1. Go to https://vercel.com/[your-team]/[your-project]
2. Click "Deployments" tab
3. Click "..." on latest deployment
4. Click "Redeploy"
5. Select "Production"
6. Click "Redeploy"

### Option B: Via Git Push

```bash
# Commit environment variable changes if needed
git add .env.local
git commit -m "Update contract addresses for SystemTokenV2 migration"
git push origin main
```

Vercel will auto-deploy.

### Option C: Via Vercel CLI

```bash
vercel --prod
```

## Step 14: Test All Features End-to-End

### Test Suite 1: Token Minting (Donations)

**Scenario:** Executive mints tokens after donation approval

1. [ ] Go to `/executive/donations`
2. [ ] Find a donation with status `pending_mint`
3. [ ] Click "Mint $SYSTEM Tokens" button
4. [ ] **Expected:** Transaction succeeds gaslessly
5. [ ] **Expected:** Donation status updates to `minting`
6. [ ] **Expected:** Tokens appear in donor's wallet
7. [ ] **Expected:** Transaction hash recorded in database

**Success Criteria:**
- ✅ Minting works without paying gas
- ✅ Executive Smart Wallet has permission via Hat
- ✅ Tokens received by donor
- ✅ Database updated correctly

### Test Suite 2: Faucet Claims

**Scenario:** User claims tokens from faucet

1. [ ] Go to faucet page
2. [ ] Connect wallet (not executive)
3. [ ] Click "Claim Tokens"
4. [ ] **Expected:** Transaction succeeds gaslessly
5. [ ] **Expected:** $SYSTEM and $SELF tokens received

**Success Criteria:**
- ✅ Faucet uses new TokenFaucet contract
- ✅ SystemTokenV2 tokens received
- ✅ Gasless transaction works

### Test Suite 3: Bounty System

**Scenario:** Create and fund bounty with SystemTokenV2

1. [ ] Go to bounty creation page
2. [ ] Create bounty with $SYSTEM token
3. [ ] **Expected:** Bounty created successfully
4. [ ] **Expected:** $SYSTEM tokens locked in BountyManagerV4
5. [ ] Apply to bounty
6. [ ] Approve submission
7. [ ] **Expected:** $SYSTEM tokens released to worker

**Success Criteria:**
- ✅ BountyManagerV4 accepts SystemTokenV2
- ✅ Token transfers work correctly
- ✅ All bounty features functional

### Test Suite 4: Event Registration

**Scenario:** Register for event with SystemTokenV2

1. [ ] Go to events page
2. [ ] Find event requiring $SYSTEM payment
3. [ ] Register for event
4. [ ] **Expected:** Registration succeeds
5. [ ] **Expected:** $SYSTEM tokens deducted

**Success Criteria:**
- ✅ EventManager accepts SystemTokenV2
- ✅ Event registration works
- ✅ Tokens transferred correctly

### Test Suite 5: Marketplace Purchases

**Scenario:** Purchase product with SystemTokenV2

1. [ ] Go to marketplace
2. [ ] Add product to cart
3. [ ] Checkout with $SYSTEM
4. [ ] **Expected:** Purchase succeeds
5. [ ] **Expected:** Product destination routing works (burn/wallet/pod)
6. [ ] **Expected:** $SYSTEM tokens handled correctly

**Success Criteria:**
- ✅ PurchaseRouter accepts SystemTokenV2
- ✅ Product configurations preserved (from migration)
- ✅ Treasury authorizations work
- ✅ Gasless purchases work

### Test Suite 6: Hat-Based Permissions

**Scenario:** Verify automatic permission management

1. [ ] Verify executive can mint (wears Hat)
2. [ ] **Expected:** `canMint()` returns true
3. [ ] Remove Executive Hat from test wallet
4. [ ] **Expected:** `canMint()` returns false
5. [ ] Try to mint without Hat
6. [ ] **Expected:** Transaction fails with permission error
7. [ ] Re-grant Executive Hat
8. [ ] **Expected:** `canMint()` returns true again

**Success Criteria:**
- ✅ Hat ownership controls mint permission
- ✅ Automatic revocation works
- ✅ No manual role management needed

### Test Suite 7: Gasless Transactions

**Scenario:** Verify all gasless features work

1. [ ] Test minting (executive) - no gas paid
2. [ ] Test faucet claim - no gas paid
3. [ ] Test marketplace purchase - no gas paid
4. [ ] Test bounty operations - no gas paid

**Success Criteria:**
- ✅ CDP Paymaster working correctly
- ✅ All whitelisted contracts/functions work
- ✅ No ETH required for users

## Rollback Plan (If Issues Arise)

If critical issues are discovered during testing:

### 1. Revert BountyManagerV4
```bash
node scripts/rollback-bounty-manager.mjs
```

### 2. Revert EventManager
```bash
node scripts/rollback-event-manager.mjs
```

### 3. Revert Environment Variables

In Vercel:
```bash
NEXT_PUBLIC_SYSTEM_TOKEN=0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
NEXT_PUBLIC_TOKEN_FAUCET=0x189aA1FA8CC41A26944A0957015d9902057c1dbA
NEXT_PUBLIC_PURCHASE_ROUTER=0xCd39D4AE4fcf91e49591396Fd9f62019878f0b78
NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED=0x2A2A62f313354f41E4bD0ff61bAd4DE85db722c9
```

### 4. Redeploy Frontend
```bash
vercel --prod
```

**Rollback Time:** ~15 minutes

## Post-Deployment Monitoring

After successful testing, monitor for 48 hours:

### Metrics to Watch

1. **Transaction Success Rate**
   - Monitor gasless transaction success
   - Check for any reverted transactions

2. **User Activity**
   - Donation minting frequency
   - Faucet claims
   - Bounty creations
   - Event registrations
   - Marketplace purchases

3. **Error Logs**
   - Frontend console errors
   - Backend API errors
   - Smart contract reverts

4. **Token Balances**
   - Verify token transfers are correct
   - Check no tokens stuck in contracts
   - Monitor treasury balances

### Tools

- **Basescan:** Monitor contract interactions
- **Vercel Logs:** Check frontend errors
- **Supabase Logs:** Check database updates
- **CDP Dashboard:** Monitor paymaster usage

## Success Criteria

Migration is successful when:

- ✅ All test suites pass
- ✅ No critical errors in 48 hours
- ✅ User feedback is positive
- ✅ All features working as before
- ✅ Gasless transactions working
- ✅ Hat-based permissions working
- ✅ No security issues discovered

## Final Cleanup (After 7 Days)

Once migration is confirmed stable:

1. [ ] Remove old contract addresses from CDP Paymaster
2. [ ] Update all documentation with new addresses
3. [ ] Archive old contract ABIs
4. [ ] Document lessons learned
5. [ ] Update README with new architecture

---

## Emergency Contacts

If critical issues arise:

- **Smart Contract Issues:** Pause contracts if possible
- **Database Issues:** Check Supabase logs
- **Frontend Issues:** Revert deployment
- **Paymaster Issues:** Check CDP Dashboard

---

**After completing all tests successfully, the migration is complete! 🎉**
