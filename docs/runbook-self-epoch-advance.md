# Runbook — Advancing the $SELF Epoch (Quarterly)

*The epoch is the global "season" counter for $SELF. Advancing it moves the
expiry window forward: $SELF earned more than K epochs ago (K = lifetime, set to
2 quarters) becomes expired. This is done **in-app, gaslessly**, by an Executive
— no command line, no private keys handled by a person.*

---

## Who can do it
Any **Executive Pod leader** (holds the `EXECUTIVE_POD_LEADER` hat). The action
is Exec-hat-gated server-side; the UI surfaces it only to Execs.

## How it works (no web wallet involved)
The "Advance epoch" button calls `/api/admin/self` (action `advanceEpoch`),
which:
1. Re-verifies the caller's Executive hat on-chain.
2. Submits `SelfEpochs.advanceEpoch()` as a **gasless sponsored user operation**
   from the backend smart wallet `0x05c06af9…` (POD_ADMIN's sponsored account),
   which holds `EPOCH_ADMIN_ROLE`.

The personal admin wallet (`0xd481…`) is **never** used by the app. It retains
`EPOCH_ADMIN_ROLE` only as a manual break-glass backup (see bottom).

## Steps (in-app)
1. Go to **Pod management → modules** (Executive view).
2. Open the **$SELF Administration** card → **Epoch** tab.
3. Confirm the displayed current epoch and lifetime (K). Note which epoch will
   expire: *"$SELF earned in epoch (current − K) and earlier is expired."*
4. Click **Advance epoch (irreversible)**.
5. Read the confirmation dialog carefully — this **cannot be undone**. Confirm.
6. On success the card shows the new epoch. (Gasless — no wallet popup.)

## When to do it
**Once per calendar quarter, at quarter close.** Before advancing:
- Make sure the quarter's earnings have been minted (run/confirm the mint-batch
  for active pods) so nothing pending is lost to the moving expiry window.
- Optionally run the prestige/Tenure recording for the closing epoch if not
  already swept.

## ⚠️ Cautions
- **Irreversible.** There is no "un-advance." Advancing twice by mistake skips a
  quarter and expires an extra epoch of $SELF.
- **One global counter** — affects every community at once (epochs are global;
  provenance is per-community, but the clock is shared).
- Do it deliberately, ideally with a second Exec aware.

---

## Break-glass (manual fallback — rarely needed)
If the in-app path is ever unavailable, an operator with the `0xd481…`
EPOCH_ADMIN key can advance manually:

```
ADMIN_EPOCH_PRIVATE_KEY=<0xd481 key> CONFIRM=yes node scripts/advance-self-epoch.mjs
```

This is the only path that touches the `0xd481` key, and it is run by a human at
a terminal, never by the app. Prefer the in-app button; this exists only as a
backup if the sponsored path fails.

---

## One-time setup requirement
For the in-app button to work, the backend smart wallet must hold EPOCH_ADMIN:

```
SelfEpochs.grantRole(EPOCH_ADMIN_ROLE, 0x05c06af9fe1a996144902D9571d1d2783866cF63)
```
- role hash: `0xa8254feae331b360dda9558bd798ab27bf43a131cb76e076a396102d8769e0ac`
- granted from `0xd481…` (current EPOCH_ADMIN)
- `0xd481…` keeps the role too (backup). Verify with `node scripts/verify-self-roles-v2.mjs`.
