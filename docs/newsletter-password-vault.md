# Newsletter Draft — Pod Password Vault

*Pitch, plain-English explanation, and security framing for the
community-facing announcement.*

---

## Headline options

- **"Your pod's shared logins, finally safe."**
- **"We built a 1Password for your pod — and even we can't read it."**
- **"Password sharing without the spreadsheet."**

## TL;DR (the 30-second version)

Every active pod now has a built-in password vault. Pod leaders turn
it on with one click, choose which members can see each saved login,
and members read what they need with a tap. Everything is encrypted
in your browser before it ever reaches our servers — which means
**even SpiritDAO operators with full database access cannot read
your pod's passwords.**

---

## The problem we were solving

Pods accumulate credentials. The newsletter scheduler login. The
Google Workspace account. The Stripe key. The shared Notion. Today,
these get scattered across DMs, screenshots, sticky notes, and "ask
Sarah, she has it." When Sarah leaves, the pod has a problem.

We wanted something that:

- Survives leader turnover automatically
- Doesn't require operators to run a separate paid tool
- Doesn't ask anyone to trust SpiritDAO with their plaintext secrets
- Lets the pod itself decide who sees what

So we built it directly into the app.

---

## How it works (for normal humans)

### Turning it on

A pod leader goes to **Pod Management → Modules → Password Vault**
and flips the switch. That single action does three things:

1. Creates an encrypted vault for that pod.
2. Grants the **"read passwords"** permission to everyone in the pod
   (subject to role-level control).
3. Gives the leader the **"manage passwords"** permission so they can
   add, edit, and decide audience.

### Your first time

The first time you open a vault, the app asks you to sign a one-line
message with your wallet. **No transaction. No gas. No money moves.**
Your signature stays in your browser and is used to generate a
private key that *only your browser knows*. The matching public key
gets uploaded so other pod members can encrypt things specifically to
you.

That's it — you're set up. You won't be asked again until your next
browser session.

### Saving a password

When a leader saves a new entry, they see a list of pod roles:

- ☑ Pod Leader *(always included — you can't lock yourself out)*
- ☐ Marketing Lead
- ☐ Finance Coordinator
- ☐ Pod Member

They check who should be able to see this one. They paste the
password. They hit save. **Before the password leaves their browser,
it's encrypted with a one-time key, and that key is independently
wrapped for each chosen recipient.** What lands on our servers is a
collection of unreadable blobs.

### Reading a password

A pod member opens the vault, clicks "Show password" on an entry
they have access to, and their browser does the decryption locally.
The plaintext never travels back to our servers. They can copy it to
their clipboard, and the clipboard auto-clears after 30 seconds
(where the browser supports it).

### When someone new joins

The new member signs the same one-line message. The vault notices
they don't yet have access to entries their role entitles them to,
and shows a banner to existing leaders:

> 🔑 Sarah is waiting for vault access. **Grant all**

Click that, and the leader's browser re-encrypts the relevant content
keys specifically for Sarah's new identity. She gets a notification.
Done.

### When someone leaves

The system marks the vault for **rotation**. The next time an active
member opens the vault, their browser re-encrypts every entry under a
fresh key, removing the departed person from the recipient list. From
that point forward, the departed person cannot read updates — though
honestly, **anything they already read with their own eyes is theirs
to remember.** No software can fix that.

---

## "Wait, what does 'we can't read it' actually mean?"

A fair question. Most apps that say "encrypted" mean **encrypted at
rest** — the database file on disk is scrambled, but the app itself
holds the keys and can decrypt anything at any time. If the company
gets a subpoena, malware, or a curious engineer, your "encrypted"
data is readable.

We did **end-to-end encryption**, which is structurally different:

- The **encryption key never leaves your browser.** It's generated
  from a signature your wallet produced.
- The server stores **only ciphertext** — unintelligible random bytes
  — and per-recipient **wrapped keys** that can only be opened by
  someone with the matching private key.
- We literally do not have the keys. We could read every row in the
  database and learn nothing about what's in any pod's vault.

It's the same security model as Signal, 1Password, and Proton Mail.
It's not new technology — it's just genuinely applied here, where a
lot of products would have shortcut.

## The four layers of security

### Layer 1 — Strong cryptography, no homemade parts

We don't roll our own crypto. Every primitive is from a peer-reviewed,
widely-used library that already powers Ethereum wallets, encrypted
messaging apps, and major password managers:

- **AES-GCM-256** — the same algorithm used to encrypt iCloud
  Keychain, Google Drive at rest, and HTTPS traffic.
- **X25519 elliptic-curve key exchange** — the math behind Signal,
  WireGuard, and TLS 1.3.
- **HKDF-SHA-256** — the key-derivation standard used everywhere.

If any of these breaks, the entire modern internet has a much bigger
problem than your pod's vault.

### Layer 2 — Keys you actually control

Most "encrypted" apps generate keys for you and store them on their
own servers. We don't. Your encryption identity is derived from a
signature your wallet alone can produce. **You — and only you — can
recreate the key, by signing the same one-line message again.**

This is the same property that makes a Bitcoin private key yours:
it's not "stored somewhere safe" — it's mathematically tied to your
wallet.

### Layer 3 — Per-entry audience control

When you save a password, you explicitly check which pod roles can
read it. The marketing manager doesn't see finance credentials. The
treasury role doesn't see editorial logins. The system enforces this
at three independent layers:

1. **Cryptographically** — only checked recipients receive a wrapped
   key. Others literally cannot decrypt, even if they got the
   ciphertext.
2. **At the database level** — row-level security policies on
   Supabase reject reads that don't pass the role overlap check.
3. **At the application level** — the server filters API responses
   to entries the caller is entitled to see.

Three locks on the same door. Any one of them being correctly
configured is enough.

### Layer 4 — Honest about what we don't protect

Security is a tradeoff space, not a product feature. Here's what we
explicitly **don't** protect against, because no software can:

- **Your laptop with malware on it.** If something is reading your
  screen, no vault can save you. (This is true of every password
  manager.)
- **Past reads.** If a member saw the password before they left,
  they remember it. Rotation prevents *future* damage, not past.
- **You sharing your wallet's signing power with a third party.**
  Your wallet provider (Coinbase, in our case) technically holds your
  signing key. We're as safe as that provider is. Same as every
  app built on a hosted wallet.

We tell you these things upfront because pretending otherwise is
how trust dies.

---

## What this unlocks for pods

- **Shared logins survive turnover.** When a leader rotates, vault
  access can be transferred cleanly without re-sharing over chat.
- **Compliance posture improves.** No more "the Stripe key was in
  someone's DM history."
- **Onboarding speeds up.** New members get access to what they need
  on day one, instead of a scavenger hunt.
- **Audit becomes possible.** The system logs creation, updates, and
  reads on the server side (no identifying content — just timestamps
  and actions) for incident response. There's no in-app surveillance
  UI; we built the logging for catastrophe, not control.

---

## How to try it

If you lead a pod:

1. Open your pod's management page.
2. Click **Modules** → toggle **Password Vault** on.
3. Click **Configure Password Vault**.
4. Set up your vault identity (one signature; ~3 seconds).
5. Click **Add password**, choose roles, save.

Members of your pod will see the vault appear once you turn it on.
They'll be prompted to set up their own identity the first time they
open it.

---

## Closing

We could have built a feature where SpiritDAO holds a master key and
"trusts itself" not to peek. That's how most platforms do it, because
it's faster to ship.

We built it the harder way — so the trust isn't ours to give or
betray. It belongs to the pod.

If the worst happens and our entire backend is breached tomorrow,
the attackers will get encrypted blobs and unreadable wrapped keys.
They will not get your passwords.

That's the bar we wanted to clear. That's what shipped today.
