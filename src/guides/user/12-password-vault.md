# Pod Password Vault

*Last updated: 2026-07-17*

## What the vault is

The Password Vault is end-to-end encrypted shared credential storage for a pod — the right place for a pod's shared service logins, API keys, and admin accounts. **End-to-end encrypted** means encryption and decryption happen in your browser: the server only ever stores scrambled ciphertext. Nobody outside your pod — including SpiritDAO's operators and the database host — can read what's inside.

## Turning it on (pod leaders)

1. Open your pod's **Manage** page → **Modules** tab.
2. Toggle on **Password Vault**.
3. A **Passwords** tab appears in the pod menu. Enabling the module automatically gives every pod role vault *access*, and leader roles vault *management* (add/edit/delete).

## Unlocking the vault (every member, each session)

When you open the **Passwords** tab without an unlocked vault, you'll see a **"Set up vault access"** prompt.

1. Click **Set up vault access**.
2. Your wallet asks you to sign one message. This is free — it's a signature, not a transaction — and it's how your browser derives your personal encryption key.
3. Done. The key stays in your browser; it is never sent to the server.

Expect this prompt again each time you come back in a new browser session. Your key is held only for as long as the tab is open, and is deliberately dropped when you close it — so nothing is left behind on a shared or lost machine. Signing again re-derives the same key and your entries are all still there.

## Using the vault (members)

- Entries are listed by **label** and **tags** — both searchable. (Labels and tags are the only unencrypted parts, so keep secrets out of them.)
- Click the **eye icon** to reveal a password, and the **copy icon** to copy it. The clipboard auto-clears after about 30 seconds.
- If an entry says **"Pending grant"**, it exists but a manager hasn't shared it with your key yet. Nothing to do — a manager will grant it, and it becomes readable on refresh.

## Managing entries (leaders / vault managers)

**Add:** click **+ Add password**. Fields:

- **Label** (required, searchable — visible to the server, so no secrets here)
- **Tags** (optional, searchable)
- **Visible to** — check which pod roles can read this entry; manager roles are always included
- **Login** (optional, encrypted) — username / email / account ID
- **Password** (required, encrypted)
- **Notes** (optional, encrypted) — login URL, MFA recovery hints, etc.

The modal shows how many people will receive the entry, and warns if any of them haven't done first-time setup yet.

**Edit:** pencil icon. **Delete:** trash icon (confirmed, permanent).

**Granting new members:** when new members finish their vault setup, managers see a banner — **"N member(s) waiting for vault access"** — with a **Grant all** button. Click it; your browser re-shares the entries with their keys. (This has to be done by a manager's browser because the server can't decrypt anything.)

**When someone loses access:** if a member leaves the pod or loses vault permission, managers see a **"Vault needs rotation"** banner. Click **Rotate now** to re-encrypt everything so future changes are unreadable to them. Be aware: anything they already saw, they know — rotation protects the future, not the past. Rotate the *actual passwords* on the external services too if that matters.

## The honest security summary

- **Protected against:** database theft, server compromise, anyone reading your pod's secrets in transit or at rest. The server never sees plaintext.
- **Not protected against:** malware on a member's own device, or a member who read a password before losing access. E2EE can't un-share knowledge.
- **No recovery service.** There's no "forgot passphrase" — access is your wallet signature. If your browser key is gone you just re-run setup and a manager re-grants you; nothing is lost as long as the pod's managers still have access.
