# Flow 01 — Onboarding & Sign In

## Who This Is For
Anyone accessing the app for the first time, or returning users signing back in.

---

## First-Time User Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER OPENS APP                           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INVITE CODE SCREEN                           │
│                                                                 │
│   "Welcome to SpiritDAO"                                        │
│                                                                 │
│   [ Enter your invite code ]                                    │
│                                                                 │
│   ┌─────────────┐                                               │
│   │   SUBMIT    │                                               │
│   └─────────────┘                                               │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                  ┌─────────┴─────────┐
                  │                   │
                  ▼                   ▼
           Code Valid           Code Invalid
                  │                   │
                  │             Show error,
                  │             try again
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CREATE YOUR WALLET                           │
│                                                                 │
│   "Set up your secure digital wallet"                           │
│                                                                 │
│   Enter email → receive one-time code → verify                  │
│                                                                 │
│   [ Verify & Create Wallet ]                                    │
│                                                                 │
│   (Powered by Coinbase — gasless smart wallet on Base)          │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                  ┌─────────┴─────────┐
                  │                   │
                  ▼                   ▼
          New User               Returning User
                  │                   │
                  ▼                   │
┌──────────────────────────┐          │
│   MINT YOUR MEMBER HAT   │          │
│                          │          │
│  "Claim your membership" │          │
│                          │          │
│  Sign 1 transaction →    │          │
│  Mints your on-chain     │          │
│  Temporal Naturalism     │          │
│  Member credential       │          │
│                          │          │
│  [ Claim Membership ]    │          │
└────────────┬─────────────┘          │
             │                        │
             └──────────┬─────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    YOU'RE IN — HOME DASHBOARD                   │
│                                                                 │
│   Your profile is created. Your wallet is active.               │
│   Your membership is verified on-chain.                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Returning User Journey

```
USER OPENS APP
      │
      ▼
Session still active?
      │
   ┌──┴──┐
  YES    NO
   │      │
   ▼      ▼
  HOME   Enter email + OTP → Wallet reconnects → HOME
```

---

## Key Moments for Demo

- **Invite Code** — Shows this is a curated, invite-based community
- **Wallet Creation** — No seed phrases, no complexity — just email OTP
- **Hat Minting** — One tap to claim your on-chain membership credential
- **All gasless** — User pays nothing during onboarding
