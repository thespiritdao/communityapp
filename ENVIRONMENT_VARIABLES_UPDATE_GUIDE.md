# Environment Variables Update Guide

## Variables to Update

After deploying new contracts, update these environment variables in `.env.local` and Vercel.

## Local Environment (.env.local)

Update these 4 addresses:

```bash
# OLD (V1)
NEXT_PUBLIC_SYSTEM_TOKEN=0xd67e460ce56be18b573aB434b3DC962c657D8Bb5
NEXT_PUBLIC_TOKEN_FAUCET=0x189aA1FA8CC41A26944A0957015d9902057c1dbA
NEXT_PUBLIC_PURCHASE_ROUTER=0xCd39D4AE4fcf91e49591396Fd9f62019878f0b78
NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED=0x2A2A62f313354f41E4bD0ff61bAd4DE85db722c9

# NEW (V2) - Replace with your deployed addresses
NEXT_PUBLIC_SYSTEM_TOKEN=0x[SYSTEM_TOKEN_V2_ADDRESS]
NEXT_PUBLIC_TOKEN_FAUCET=0x[NEW_TOKEN_FAUCET_ADDRESS]
NEXT_PUBLIC_PURCHASE_ROUTER=0x[NEW_PURCHASE_ROUTER_ADDRESS]
NEXT_PUBLIC_PURCHASE_ROUTER_DECENTRALIZED=0x[NEW_PURCHASE_ROUTER_DECENTRALIZED_ADDRESS]
```

### Variables That Stay The Same

These do NOT need to change:

```bash
# Unchanged
NEXT_PUBLIC_SELF_TOKEN=0x...
NEXT_PUBLIC_BOUNTY_MANAGER=0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2
NEXT_PUBLIC_EVENT_MANAGER=0x5e77aD7dD2C93E19aad6ab3c0a8829b729fEA3F9
NEXT_PUBLIC_HATS_PROTOCOL=0x3bc1A0Ad72417f2d411118085256fC53CBdDd137
# ... all other variables
```

## Vercel Environment Variables

### 1. Go to Vercel Dashboard

URL: https://vercel.com/[your-team]/[your-project]/settings/environment-variables

### 2. Update Variables

For each of the 4 variables above:

1. Find the variable (e.g., `NEXT_PUBLIC_SYSTEM_TOKEN`)
2. Click "Edit"
3. Update the value to new address
4. Save

**Environments to Update:**
- Production
- Preview
- Development

### 3. Redeploy

After updating variables:
1. Go to "Deployments" tab
2. Click "..." on latest deployment
3. Click "Redeploy"
4. Select "Production"
5. Click "Redeploy"

## Verification Script

Run this to verify environment variables are correct:

```bash
node scripts/verify-env-vars.mjs
```
