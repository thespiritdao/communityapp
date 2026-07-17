# Community Agent (Pod AI)

*Last updated: 2026-07-17*

## What the Community Agent is

The Community Agent is an optional AI member for your pod. Once enabled, it:

- Posts a **daily discussion prompt** to a forum category you choose
- **Replies when @mentioned** in your pod's forum threads and chat channels
- Drafts **event suggestions** weekly (leaders review before anything publishes, unless you opt into auto-publish)

It answers from your pod's own material: forum posts (ingested automatically) plus any documents leaders upload. It cannot see private messages or the password vault, and each pod's knowledge is isolated — your agent knows your pod, not others.

**How it differs from Sensemaker:** Sensemaker is the DAO-wide assistant — free, for everyone, answering questions about SpiritDAO and the app. The Community Agent is *your pod's* — it knows your pod's discussions and documents, participates in your spaces, and is configured by your leaders.

## Talking to it (members)

- Reply to its daily discussion posts like any forum thread.
- Or @mention it by name anywhere in your pod's forum or enabled chat channels — it shows up in the mention autocomplete like a member. Ask it things like "@Kairos what did we decide about the spring planting event?"
- Expect a reply within a couple of minutes, not instantly — it checks for mentions on a short cycle.

## Setting it up (pod leaders)

1. **Enable the module:** pod **Manage** → **Modules** → under Paid Modules, toggle **Community AI Agent**. An **Agents** tab appears in your pod menu.
2. **Activate the subscription:** the agent costs **25 $SYSTEM for 30 days**, paid from the Agents tab via an **Activate** button (the $SYSTEM is burned; the transaction is gas-free). You'll be prompted to renew as expiry approaches. If it lapses, the agent quietly stops posting until renewed — nothing is lost.
3. **Configure it** in the Agents tab:
   - **Name** and **avatar** — how it appears in forums and chat
   - **Persona** — optional instructions for tone and personality
   - **Daily post hour** (UTC) and the **forum category** it posts to
   - **Chat channels** it should listen in for @mentions
   - **Auto-publish events** — off by default; when off, its event ideas appear as drafts for you to edit, publish, or discard
4. **Feed it knowledge:** in the Agents tab, use **Upload Documents** (PDF, TXT, or MD). Your pod's forum posts are ingested automatically. The more relevant material it has, the better its answers — with an empty corpus it falls back to generic responses.

A note on permissions: leaders can delegate agent configuration to a member via the **agent management** permission, but subscription/billing actions always stay leader-only.

## Good to know

- One agent per pod.
- @mention replies run on a ~2-minute cycle — it's a colleague, not a chatbot window.
- Configuration changes overwrite the previous setup (there's no version history), so note your persona text somewhere if you iterate on it.
- If the daily posts stop, the usual cause is an expired subscription — check the Agents tab.
