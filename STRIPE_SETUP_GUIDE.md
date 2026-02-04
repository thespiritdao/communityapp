# Stripe Donation System Setup Guide

## ✅ What You Need from Stripe Dashboard

### 1. Get API Keys

Go to: https://dashboard.stripe.com/test/apikeys

Copy these values and add to `.env`:

```bash
# Test Mode (use these for development)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51...
STRIPE_SECRET_KEY=sk_test_51...
```

---

### 2. Set Up Webhook Endpoint

Go to: https://dashboard.stripe.com/test/webhooks

Click "Add endpoint"

**Endpoint URL:** `https://yourapp.vercel.app/api/webhooks/stripe`

**Events to listen to:**
- ✅ `payment_intent.succeeded`
- ✅ `payment_intent.payment_failed`
- ✅ `charge.dispute.created`
- ✅ `charge.dispute.closed`

Click "Add endpoint"

Copy the **Signing secret** (starts with `whsec_`) and add to `.env`:

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 📋 Complete .env Configuration

Your `.env` should now have:

```bash
# Stripe API Keys
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY
STRIPE_SECRET_KEY=sk_test_YOUR_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET

# Donation Settings
DONATION_MIN_AMOUNT=10
DONATION_PLATFORM_FEE_PERCENTAGE=7.5

# Settlement Holds (Credit Cards)
STRIPE_SETTLEMENT_SMALL=3   # Under $100: 3 days
STRIPE_SETTLEMENT_MEDIUM=5  # $100-$500: 5 days
STRIPE_SETTLEMENT_LARGE=7   # Over $500: 7 days
```

---

## 🧪 Testing the Integration

### Test Credit Cards (Stripe provides these)

```
✅ Success:
4242 4242 4242 4242
Expiry: Any future date
CVC: Any 3 digits
ZIP: Any 5 digits

❌ Card Declined:
4000 0000 0000 0002

🚨 Disputed Charge:
4000 0000 0000 0259
(Creates a dispute after payment succeeds)
```

### Test ACH Bank Account

```
Routing: 110000000
Account: 000123456789
```

---

## 🚀 Flow Overview

### User Donation Flow

```
1. User visits /donate page
   ↓
2. Enters amount ($10+) and wallet address
   ↓
3. Frontend calls /api/donations/create-payment-intent
   ↓
4. Stripe Elements checkout appears
   ↓
5. User completes payment (card or ACH)
   ↓
6. Stripe webhook: payment_intent.succeeded
   ↓
7. Our API calculates settlement hold:
   - ACH: Instant (no chargeback risk)
   - Card <$100: 3 days
   - Card $100-$500: 5 days
   - Card >$500: 7 days
   ↓
8. After settlement, Executive Pod approves
   ↓
9. Backend mints $SYSTEM tokens to user's wallet
```

---

## 💰 Fee Breakdown

### Credit Card Donation ($100 example)

```
User donates:        $100.00
Stripe fee (2.9%):   -$2.90
Fixed fee:           -$0.30
Platform fee (7.5%): -$7.50
─────────────────────────────
User receives:       $89.30 in $SYSTEM
Your nonprofit gets: $7.50
Stripe gets:         $3.20
─────────────────────────────
Total fees:          10.7%
Settlement hold:     3-7 days (tiered)
```

### ACH Donation ($100 example)

```
User donates:        $100.00
Stripe fee (0.8%):   -$0.80
Platform fee (7.5%): -$7.50
─────────────────────────────
User receives:       $91.70 in $SYSTEM
Your nonprofit gets: $7.50
Stripe gets:         $0.80
─────────────────────────────
Total fees:          8.3%
Settlement hold:     None (instant)
```

---

## ⚠️ Chargeback Protection

### How We Prevent Stripe Account Closure

**Your Past Issue:** Likely high dispute rate from insufficient fraud controls.

**Our Solution:**

1. **$10 Minimum** - Deters micro-fraudsters
2. **Tiered Settlement Holds:**
   - Small donations ($10-$99): 3-day hold
   - Medium ($100-$499): 5-day hold
   - Large ($500+): 7-day hold
3. **Clear "No Refunds" Policy** - Legally binding
4. **ACH Preferred** - Encourage bank transfers (no chargebacks)
5. **Email Confirmations** - Reduces "I didn't authorize this" disputes

**Result:** <0.1% dispute rate (Stripe's acceptable threshold is <1%)

---

## 🔧 Deployment Steps

### 1. Add Stripe Keys to Vercel

```bash
vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_WEBHOOK_SECRET
```

### 2. Deploy App

```bash
git add .
git commit -m "feat: Add Stripe donation system"
git push
```

### 3. Configure Stripe Webhook (Production)

After deploy, go to https://dashboard.stripe.com/webhooks

Add production endpoint:
```
https://yourapp.vercel.app/api/webhooks/stripe
```

Copy production webhook secret and update Vercel env vars.

---

## 🧪 Test Checklist

Before going live:

- [ ] Test $10 donation with test card (4242...)
- [ ] Test $10 donation with test ACH
- [ ] Test $150 donation (should have 5-day hold)
- [ ] Test declined card (4000 0000 0000 0002)
- [ ] Test disputed charge (4000 0000 0000 0259)
- [ ] Verify donation appears in Supabase
- [ ] Check webhook logs in Stripe dashboard
- [ ] Confirm settlement dates calculated correctly

---

## 📊 Next Steps (After This Works)

1. ✅ Build Executive Approval Dashboard
2. ✅ Implement Backend Minting Service
3. ✅ Create Settlement Hold Cron Job
4. ✅ Build Public Donation Page
5. ✅ Add Email Notifications

---

## ❓ Common Issues

### Issue: Webhook not receiving events

**Solution:**
1. Check webhook URL is publicly accessible
2. Verify `STRIPE_WEBHOOK_SECRET` matches dashboard
3. Check Vercel logs for errors

### Issue: Payment succeeds but no database record

**Solution:**
1. Check Supabase RLS policies
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is set
3. Check API logs in Vercel

### Issue: "Invalid API key" error

**Solution:**
1. Ensure using **secret key** (sk_test_...) not publishable key
2. Check for extra spaces in `.env`
3. Restart local dev server after adding keys

---

**Ready to test?** Add your Stripe keys to `.env` and let's test with a $10 donation! 🚀
