# Linking Your External Wallet — TreeGens Member Guide

*Last updated: 2026-07-16*

*Audience: TreeGens members (and leaders onboarding them). Written for the
pod knowledge base — no technical background assumed.*

---

## What this is

Your $TGN counts toward TreeGens governance on SpiritDAO — both **pod
eligibility** and **voting**. But your $TGN probably lives in your own
wallet (MetaMask, Rabby, Coinbase Wallet), not in the SpiritDAO wallet
that was created for you when you joined the app.

**Wallet linking** lets you prove you own that outside wallet, so the
$TGN in it counts — *without moving anything*. You sign one free
message. Your tokens never leave your wallet. SpiritDAO can never
touch, move, or spend anything in it — we only *read* the balance.

**What counts once you've linked:**
- $TGN held in your SpiritDAO wallet
- $TGN held in every wallet you've linked
- $TGN you've staked on Hydrex (from any of those wallets)

All of it is added together whenever TreeGens checks eligibility or
opens a vote.

---

## Before you start

- **Use a desktop browser with your wallet extension installed**
  (MetaMask, Rabby, or Coinbase Wallet extension). On a phone, open
  app.spiritdao.org inside your wallet app's built-in browser instead
  (e.g. MetaMask app → Browser tab) — a regular mobile browser can't
  see your wallet.
- Make sure the wallet account you want to link is the one that
  actually holds your $TGN (check before you connect — you can link
  more than one if needed).
- Linking is **free**. You will sign a message, not a transaction.
  If your wallet ever asks for gas or a payment during this, stop —
  that's not our flow.

---

## Step by step

1. **Log in** at [app.spiritdao.org](https://app.spiritdao.org).
2. From the home screen, tap the **Identity** card.
3. Scroll down to the **Linked Wallets** section.
4. Click **Link external wallet**.
5. Your browser wallet will pop up asking to **connect** — pick the
   account that holds your $TGN and approve.
6. The wallet will then ask you to **sign a message**. Read it — it
   says you're proving ownership of this address for your SpiritDAO
   account. Signing is free and moves nothing. Click **Sign**.
7. Done. The wallet now appears in your Linked Wallets list with an
   **External** tag.

### Check that it worked

Open the **TreeGens pod page**. Near the top you'll see a $TGN balance
chip. It should now show your **combined** total and say
*"governance eligibility · incl. linked wallets."* If the number
matches what you hold across your wallets, you're set.

---

## Removing a wallet

In **Identity → Linked Wallets**, click **Remove** next to any
external wallet. Its balance stops counting immediately. You can
re-link it any time by repeating the steps above.

---

## Common issues

| Problem | Fix |
|---|---|
| "No browser wallet detected" | Install MetaMask (or similar) as a browser extension, or use your wallet app's built-in browser on mobile. |
| Wallet connected the wrong account | Remove/disconnect in the wallet extension, switch to the right account there, then click **Link external wallet** again. |
| "This wallet is already linked to another account" | Each wallet can only be linked to one SpiritDAO account. If you linked it to an old/duplicate account, remove it there first. |
| Balance chip doesn't update | Refresh the TreeGens pod page. If it still shows the old number, confirm the wallet shows in Identity → Linked Wallets. |
| Signed but linking failed | The signature request expires after a few minutes. Just click **Link external wallet** and try again. |

---

## Privacy & security, plainly

- We store your wallet **address** (which is public on the blockchain
  anyway) — nothing else.
- The signature proves ownership **once**. It does not give SpiritDAO
  any ongoing permission, allowance, or access to your funds.
- Your $TGN is only ever used as a **governance signal** — it is never
  involved in bounties, the marketplace, payments, or anything
  financial inside the app.
- You can remove a linked wallet at any time.

---

## For SpiritDAO admins (one-time setup, already done for TreeGens)

External wallet linking is off by default and can only be switched on
by the SpiritDAO **Executive Pod** — a pod's own leaders cannot enable
it for themselves.

1. As an Executive Pod Leader, open the pod's **Manage → Modules** tab.
2. Under Add-Ons, toggle **External Wallet Linking** on.
3. From that moment, eligibility checks, the $TGN balance chip, and
   new proposal vote snapshots for that pod count members' linked
   wallets. (Snapshots for proposals published *before* the toggle are
   unchanged — who can vote on an open proposal never changes
   retroactively.)
