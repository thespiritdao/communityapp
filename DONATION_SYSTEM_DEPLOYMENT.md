# 🎉 Donation System Deployment Guide

## ✅ What's Been Built

You now have a complete end-to-end donation system with:

### Backend Infrastructure
- ✅ **Stripe Integration** - Payment intent creation + webhook handling
- ✅ **Executive Approval Workflow** - 2-of-3 multi-sig via Hats Protocol
- ✅ **Backend Minting Service** - On-chain $SYSTEM token minting
- ✅ **Settlement Cron Job** - Runs every 5 minutes on Vercel
- ✅ **Database Tables** - All tables created with RLS policies

### Frontend
- ✅ **Donation Page** - `/donate` with Stripe Elements
- ✅ **Success Page** - `/donate/success` with real-time status
- ✅ **Executive Dashboard** - `/executive/donations` for approvals

### Smart Features
- Tiered settlement holds (3/5/7 days based on amount)
- ACH instant approval (no chargeback risk)
- Automatic minting trigger when 2-of-3 threshold met
- Comprehensive error handling and retry logic

---

## 🚀 Deployment Checklist

### 1. Configure Stripe Webhook (CRITICAL)

After your next Vercel deployment:

1. Go to: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. **Endpoint URL:** `https://app.spiritdao.org/api/webhooks/stripe`
4. **Events to select:**
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.dispute.created`
   - `charge.dispute.closed`
5. Copy the **Signing secret** (starts with `whsec_`)
6. Add to Vercel environment variables:
   ```bash
   vercel env add STRIPE_WEBHOOK_SECRET production
   # Paste: whsec_YOUR_SECRET_HERE
   ```

---

### 2. Configure Minting Wallet

The backend minting service needs a wallet with **EXECUTIVE_ROLE** on the SystemToken contract.

#### Option A: Grant Role to Existing Wallet

Use the wallet at `EXECUTIVE_MINTING_PRIVATE_KEY` in your `.env`:

```solidity
// On SystemToken contract (0xd67e460ce56be18b573aB434b3DC962c657D8Bb5)
// Call: grantRole(EXECUTIVE_ROLE, 0xYourMintingWalletAddress)
```

#### Option B: Create Dedicated Minting Wallet

1. Create new wallet specifically for minting
2. Fund with ~0.01 ETH on Base for gas
3. Grant EXECUTIVE_ROLE to new wallet
4. Update `EXECUTIVE_MINTING_PRIVATE_KEY` in Vercel:
   ```bash
   vercel env add EXECUTIVE_MINTING_PRIVATE_KEY production
   ```

**Important:** This wallet must have:
- ✅ EXECUTIVE_ROLE on SystemToken contract
- ✅ ETH balance for gas (0.01+ ETH recommended)

---

### 3. Verify Environment Variables in Vercel

Go to: https://vercel.com/thespiritdao/communityapp/settings/environment-variables

Ensure these are set:

#### Stripe
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_live_...)
- `STRIPE_SECRET_KEY` (sk_live_...)
- `STRIPE_WEBHOOK_SECRET` (whsec_...) ← **Update after webhook creation**

#### Donation Config
- `DONATION_MIN_AMOUNT=10`
- `DONATION_PLATFORM_FEE_PERCENTAGE=7.5`
- `STRIPE_SETTLEMENT_SMALL=3`
- `STRIPE_SETTLEMENT_MEDIUM=5`
- `STRIPE_SETTLEMENT_LARGE=7`

#### Minting Service
- `EXECUTIVE_MINTING_PRIVATE_KEY` (0x...)
- `NEXT_PUBLIC_APP_URL=https://app.spiritdao.org`

#### Cron Job Security
- `CRON_SECRET` (already set)

---

### 4. Deploy to Vercel

```bash
git push  # Already done!
```

Vercel will automatically:
- Deploy your app
- Enable the settlement cron job (`/api/cron/process-settlements`)
- Make the webhook endpoint live

---

### 5. Test the Complete Flow

#### Test Donation ($10 with Test Card)

1. Go to: https://app.spiritdao.org/donate
2. Connect wallet
3. Enter amount: `10`
4. Enter email: `test@example.com`
5. Use Stripe test card:
   ```
   Card: 4242 4242 4242 4242
   Expiry: 12/34
   CVC: 123
   ZIP: 12345
   ```
6. Complete payment
7. Should redirect to success page

#### Verify in Database

Check Supabase → Table Editor → `pending_donations`:
- Status should be `awaiting_settlement` (3-day hold for small amounts)

#### Test Executive Approval

1. Wait for settlement period OR manually update:
   ```sql
   UPDATE pending_donations
   SET status = 'awaiting_executive_approval',
       settlement_date = NOW() - INTERVAL '1 hour'
   WHERE id = 'YOUR_DONATION_ID';
   ```

2. Go to: https://app.spiritdao.org/executive/donations
3. Connect wallet with Executive Pod Leader HAT
4. Click "Approve Donation"
5. Repeat with second executive wallet
6. After 2nd approval, minting should trigger automatically

#### Verify Minting

Check:
- Donation status should be `minted`
- User's wallet should have $SYSTEM tokens
- `tx_hash` field should have Base transaction hash

---

## 🧪 Test Scenarios

### Scenario 1: Credit Card Donation ($50)

```
Amount: $50
Payment Method: Credit Card (4242...)
Expected:
- 5-day settlement hold ($100-$500 tier)
- Status: awaiting_settlement → awaiting_executive_approval
- After 2 approvals: minted
```

### Scenario 2: ACH Donation ($100)

```
Amount: $100
Payment Method: Bank Account (Test: Routing 110000000, Account 000123456789)
Expected:
- Instant settlement (0 days)
- Status: awaiting_executive_approval immediately
- After 2 approvals: minted
```

### Scenario 3: Large Donation ($600)

```
Amount: $600
Payment Method: Credit Card
Expected:
- 7-day settlement hold (>$500 tier)
- Status: awaiting_settlement → awaiting_executive_approval
```

### Scenario 4: Declined Card

```
Card: 4000 0000 0000 0002
Expected:
- Payment fails
- Status: failed
- No database record created
```

---

## 📊 Monitoring

### Check Donation Status

```bash
# API endpoint
GET https://app.spiritdao.org/api/donations/create-payment-intent?donationId=XXX
```

### Check Pending Approvals

```bash
# Executive dashboard
https://app.spiritdao.org/executive/donations
```

### Check Stripe Webhook Logs

1. Go to: https://dashboard.stripe.com/webhooks
2. Click your webhook endpoint
3. View recent events and responses

### Check Vercel Cron Logs

1. Go to: https://vercel.com/thespiritdao/communityapp/logs
2. Filter by: `/api/cron/process-settlements`
3. Should run every 5 minutes

---

## 🔧 Troubleshooting

### Issue: Webhook not receiving events

**Solution:**
1. Check webhook URL is correct
2. Verify `STRIPE_WEBHOOK_SECRET` matches dashboard
3. Check Vercel logs for errors
4. Test webhook with Stripe CLI:
   ```bash
   stripe trigger payment_intent.succeeded
   ```

### Issue: Minting fails with "Insufficient gas"

**Solution:**
1. Check minting wallet balance on Base:
   ```bash
   # View on BaseScan
   https://basescan.org/address/YOUR_MINTING_WALLET
   ```
2. Add ETH if below 0.001 ETH

### Issue: Minting fails with "AccessControl: account ... is missing role"

**Solution:**
1. Verify minting wallet has EXECUTIVE_ROLE on SystemToken:
   ```javascript
   // Call on SystemToken contract
   hasRole(EXECUTIVE_ROLE, mintingWalletAddress)
   ```
2. If false, grant role using owner wallet

### Issue: Executive can't approve (403 error)

**Solution:**
1. Verify executive has Executive Pod Leader HAT
2. Check on-chain:
   ```javascript
   // Hats Protocol contract
   balanceOf(executiveWallet, EXECUTIVE_POD_LEADER_HAT_ID) > 0
   ```
3. Check database pod_members table for revoked status

---

## 🎯 Next Steps (Future Enhancements)

### Immediate
- [ ] Set up email notifications via SendGrid
- [ ] Add Discord webhook for executive alerts
- [ ] Build admin analytics dashboard

### Short-term
- [ ] Implement burn request system (reverse flow)
- [ ] Add Mercury ACH for lower fees (0.8% vs Stripe ACH 0.8%)
- [ ] Create public leaderboard of top donors

### Long-term
- [ ] On-chain governance for approvals (replace 2-of-3)
- [ ] Recurring donation subscriptions
- [ ] Corporate matching donations
- [ ] Tax receipt generation (501c3 compliance)

---

## 📞 Support

If you encounter issues:

1. Check Vercel logs: `vercel logs --follow`
2. Check Supabase logs in Dashboard
3. Check Stripe webhook logs
4. Review this guide's troubleshooting section

**Critical Contacts:**
- Stripe Support: https://support.stripe.com
- Vercel Support: https://vercel.com/support

---

## 🎉 You're Ready!

Your donation system is production-ready. Key metrics to monitor:

- **Chargeback Rate:** Keep below 0.1% (Stripe threshold is 1%)
- **Approval Time:** Target < 24 hours from settlement to minting
- **Minting Success Rate:** Should be 100% after approval

**Go Live:**
1. Update Stripe webhook secret in Vercel
2. Grant EXECUTIVE_ROLE to minting wallet
3. Test with real $10 donation
4. Announce to community! 🚀
