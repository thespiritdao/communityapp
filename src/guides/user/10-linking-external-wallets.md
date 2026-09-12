# Linking External Wallets

*Last updated: 2026-07-16*

## What wallet linking is

When you join SpiritDAO, the app creates a secure embedded wallet for you — that's where your $SELF, accreditations, and community tokens live. But some members also hold tokens in a personal wallet they manage themselves, like MetaMask, Rabby, or Coinbase Wallet.

**Wallet linking** lets you prove you own a personal wallet so the tokens in it can count toward community governance — without moving anything. You sign one free message. Your tokens never leave your wallet, and SpiritDAO can never touch, move, or spend anything in it. The app only *reads* the balance.

## When you'd use it

Wallet linking matters for communities on SpiritDAO that use their own governance token. For example, the Treegens DAO pod uses $TGN: holding a minimum amount of $TGN is part of eligibility for certain roles and votes. If your $TGN lives in MetaMask rather than your SpiritDAO wallet, linking makes it count.

What counts once you've linked (for a pod with this feature enabled):

- Tokens held in your SpiritDAO wallet
- Tokens held in every wallet you've linked
- For $TGN: tokens you've staked on Hydrex from any of those wallets

All of it is added together whenever the pod checks eligibility or opens a vote. Voting itself stays one-person-one-vote — linked tokens affect *whether* you can vote, never how much your vote counts.

This feature is enabled per pod by the SpiritDAO Executive Pod. If your pod doesn't use a governance token, you don't need wallet linking.

## Before you start

- Use a **desktop browser with your wallet extension installed** (MetaMask, Rabby, or Coinbase Wallet extension). On a phone, open app.spiritdao.org inside your wallet app's built-in browser (for example, MetaMask app → Browser tab) — a regular mobile browser can't see your wallet.
- Make sure the wallet account you want to link actually holds the tokens. You can link more than one wallet.
- Linking is **free**. You sign a message, not a transaction. If your wallet ever asks for gas or payment during this flow, stop — that is not our flow.

## How to link a wallet, step by step

1. Log in at app.spiritdao.org.
2. From the home screen, tap the **Identity** card.
3. Scroll down to the **Linked Wallets** section.
4. Click **Link external wallet**.
5. Your browser wallet pops up asking to connect — pick the account that holds your tokens and approve.
6. The wallet then asks you to **sign a message**. It says you're proving ownership of this address for your SpiritDAO account. Signing is free and moves nothing. Click Sign.
7. Done. The wallet appears in your Linked Wallets list with an **External** tag.

![Identity → Linked Wallets: link an external wallet by signing a message.](https://app.spiritdao.org/images/docs/linking-wallets/01-linked-wallets.png)

## Checking that it worked

Open your pod's page. If the pod uses a governance token, a balance chip near the top shows your total. After linking, it shows the **combined** amount and says "governance eligibility · incl. linked wallets."

![A linked external wallet listed with its type.](https://app.spiritdao.org/images/docs/linking-wallets/02-linked-list.png)

## Removing a linked wallet

In **Identity → Linked Wallets**, click **Remove** next to any external wallet. Its balance stops counting immediately. You can re-link it any time.

## Troubleshooting

- **"No browser wallet detected"** — install MetaMask (or a similar extension), or use your wallet app's built-in browser on mobile.
- **Connected the wrong account** — disconnect in the wallet extension, switch to the right account there, then click Link external wallet again.
- **"This wallet is already linked to another account"** — each wallet can only link to one SpiritDAO account. Remove it from the other account first.
- **Balance chip doesn't update** — refresh the pod page and confirm the wallet shows under Identity → Linked Wallets.
- **Signed but linking failed** — the signature request expires after a few minutes. Click Link external wallet and try again.

## Privacy and security

- We store your wallet **address** (already public on the blockchain) — nothing else.
- The signature proves ownership once. It grants no ongoing permission, allowance, or access to your funds.
- Linked-wallet tokens are only a **governance signal**. They are never involved in bounties, the marketplace, payments, or anything financial inside the app.
- You can remove a linked wallet at any time.
