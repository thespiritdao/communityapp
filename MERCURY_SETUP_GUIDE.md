# Mercury Donation System Setup Guide

## Overview

This guide will help you set up Mercury bank integration for accepting fiat donations and converting them to $SYSTEM tokens.

**Key Insight**: Mercury doesn't have a "payment checkout" system like Stripe. Instead, donations work via **direct bank transfers** that Mercury monitors via webhooks.

---

## How It Works

### Simplified Donation Flow

```
1. User initiates bank transfer to your Mercury account
   └─ Via ACH debit, wire transfer, or check deposit

2. Mercury creates transaction (status: "pending")
   └─ Webhook fires: transaction.created

3. Our app records pending donation in database
   └─ Calculates fees and $SYSTEM tokens to mint

4. After 3 business days, transaction completes
   └─ Webhook fires: transaction.updated (status: "completed")

5. Executive Pod receives notification
   └─ 2-of-3 approvers must sign off

6. Backend mints $SYSTEM tokens to user's wallet
   └─ User receives tokens, transaction complete
```

---

## Step 1: Run Mercury Webhook Setup Script

This script creates a webhook in Mercury to listen for donation transactions.

### Prerequisites

- ✅ Mercury API key added to `.env`
- ✅ App deployed to Vercel (webhook must be publicly accessible)
- ✅ Database migration applied

### Run the script:

```bash
node scripts/setup-mercury-webhook.mjs
```

### Expected Output:

```
🔧 Setting up Mercury webhook...

📡 Webhook URL: https://yourapp.vercel.app/api/webhooks/mercury
🎯 Event Types: transaction.created, transaction.updated

✅ Webhook created successfully!

📋 Webhook Details:
   ID: wh_abc123
   URL: https://yourapp.vercel.app/api/webhooks/mercury
   Status: active
   Event Types: transaction.created, transaction.updated
   Created At: 2026-02-03T12:00:00Z

🔐 IMPORTANT: Save this webhook secret to your .env file:
   MERCURY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx

⚠️  This secret is only shown once! Copy it now.
```

### Add webhook secret to `.env`:

```bash
MERCURY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
```

---

## Step 2: Configure Donation Instructions

Since Mercury doesn't have a checkout page, donors need instructions on how to send money to your account.

### Create a public donation page with these instructions:

**Example: `/app/donate/page.tsx`**

```tsx
export default function DonatePage() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">Donate to SpiritDAO</h1>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-3">How to Donate</h2>

        <ol className="space-y-3">
          <li>
            <strong>1. Get your wallet address ready</strong>
            <p className="text-sm text-gray-700">
              Your $SYSTEM tokens will be sent to your connected wallet
            </p>
          </li>

          <li>
            <strong>2. Send a bank transfer to:</strong>
            <div className="bg-white p-3 rounded mt-2">
              <p><strong>Account Name:</strong> SpiritDAO</p>
              <p><strong>Routing Number:</strong> [Your Mercury Routing]</p>
              <p><strong>Account Number:</strong> [Your Mercury Account]</p>
            </div>
          </li>

          <li>
            <strong>3. IMPORTANT: Include your wallet address in the transfer note</strong>
            <p className="text-sm text-red-600">
              Without this, we won't know where to send your tokens!
            </p>
            <p className="text-sm text-gray-700 mt-1">
              Example note: "Donation - 0x1234...5678"
            </p>
          </li>

          <li>
            <strong>4. Receive your $SYSTEM tokens</strong>
            <p className="text-sm text-gray-700">
              After 3-5 business days, you'll receive tokens (minus 8.3% fees)
            </p>
          </li>
        </ol>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-semibold">💰 Fee Breakdown</h3>
        <ul className="text-sm space-y-1 mt-2">
          <li>Mercury processing: 0.8%</li>
          <li>Platform operations: 7.5%</li>
          <li><strong>You receive: 91.7% in $SYSTEM tokens</strong></li>
        </ul>
      </div>
    </div>
  );
}
```

---

## Step 3: Test the Webhook

### Option A: Test in Production (Real Money)

1. Send a small test transfer ($10) to your Mercury account
2. Include your wallet address in the note field
3. Monitor Vercel logs to see webhook events

### Option B: Manually Trigger Webhook (Testing)

Create a test script:

```typescript
// scripts/test-mercury-webhook.mjs
const response = await fetch('http://localhost:3000/api/webhooks/mercury', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'mercury-signature': 'test_signature' // Will fail signature check
  },
  body: JSON.stringify({
    type: 'transaction.created',
    data: {
      id: 'txn_test123',
      amount: 10000, // $100 in cents
      status: 'pending',
      counterpartyName: 'Test Donor',
      note: '0x1234567890123456789012345678901234567890'
    }
  })
});

console.log(await response.json());
```

---

## Step 4: Monitor Donations

Check Supabase to see pending donations:

```sql
SELECT
  id,
  fiat_amount,
  system_tokens_to_mint,
  user_wallet,
  status,
  created_at
FROM pending_donations
ORDER BY created_at DESC;
```

---

## Common Issues & Troubleshooting

### Issue: Webhook not receiving events

**Causes:**
- Webhook URL not publicly accessible (still local dev)
- Mercury webhook not created properly
- Signature verification failing

**Solution:**
1. Deploy to Vercel first
2. Re-run `scripts/setup-mercury-webhook.mjs` with production URL
3. Check Vercel logs for webhook errors

---

### Issue: Donation created but no wallet address

**Cause:** Donor didn't include wallet in transfer note

**Solution:**
- Add prominent instructions on donation page
- Consider adding a form where users pre-register their bank account → wallet mapping

---

### Issue: Signature verification fails

**Cause:** Wrong webhook secret in `.env`

**Solution:**
1. Check `.env` for `MERCURY_WEBHOOK_SECRET`
2. Must match secret from Mercury webhook creation
3. Redeploy after adding secret

---

## Next Steps

Once webhooks are working:

✅ Build executive approval dashboard
✅ Implement backend minting service
✅ Add email notifications for donors
✅ Create public treasury dashboard

---

## Alternative: Plaid Integration (Future Enhancement)

For a better UX, consider adding Plaid to collect bank account info upfront:

1. User connects bank account via Plaid
2. App initiates ACH debit on their behalf
3. No need for manual transfer instructions
4. Wallet address already known

**Cost:** Plaid charges ~$0.15 per connection + $0.10 per transaction

Would you like me to build this as a Phase 2 enhancement?
