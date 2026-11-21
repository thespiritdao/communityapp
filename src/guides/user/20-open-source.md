# Open Source: Join SpiritDAO or Run Your Own

*Last updated: 2026-11-21*

The software behind SpiritDAO is open source. Anyone can read it, check it,
run it and improve it. This page explains what that means, who it is for, and
why most communities will be better served by joining SpiritDAO than by
running their own copy.

- **Code:** [github.com/thespiritdao/communityapp](https://github.com/thespiritdao/communityapp)
- **License:** GNU Affero General Public License v3.0 (AGPL-3.0)
- **Setup guide:** [docs/SETUP.md](https://github.com/thespiritdao/communityapp/blob/main/docs/SETUP.md)

---

## Why we opened it

SpiritDAO exists to advance the **Eight Dignities**. Three of them,
**Information, Communication and Education**, are things this platform
delivers directly. Keeping the tools that deliver them locked away would
contradict them.

It also matters for trust. We already ask members not to take our word for how
our AI agent is constrained, because the limits are in code anyone can inspect.
Publishing the whole platform extends that to everything else: how votes are
counted, who can see what, and where money goes.

## What the license allows

You may use, study, change and share the code. If you run a modified version as
a service for other people, you must offer your changes to those people under
the same license. Improvements flow back to the commons instead of being locked
into someone's product.

Three things are not part of the open-source release:

- **The SpiritDAO name and logo.** A copy must use its own name and branding
  and must not present itself as SpiritDAO.
- **SpiritDAO's deployment.** The code does not connect to our contracts,
  treasury, database or members. A copy starts empty and creates its own.
- **Member information.** No member data is in the code, and none ever will be.

---

## Join SpiritDAO or run your own?

**If you are a community that wants these tools, join SpiritDAO.** That is what
the platform was built for. Running your own copy gives you the software, not
the network, and it makes your group responsible for servers, keys, security
and upkeep.

| | Join SpiritDAO as a pod | Run your own copy |
|---|---|---|
| Forums, chat, video, events, governance, treasury, bounties | Yes, ready today | Yes, after you set it all up |
| Hosting, updates, security fixes, backups | Handled for you | Your job |
| Keys that control money and membership | Looked after by SpiritDAO | Held by you; losing or leaking one is your problem |
| Tax-deductible donations (fiscal sponsorship) | Available through SpiritDAO | Not included; you need your own 501(c)(3) or sponsor |
| Shared economy, Community Fund, other communities | You are part of it | Separate and on your own |
| Gas sponsorship so members never buy crypto | Included | You pay for it |
| Your own name and branding | Pod Faces lets you customise how your pod looks | Full control |
| Technical skill needed | None | A developer comfortable with web apps, databases and smart contracts |

### Good reasons to run your own copy

- **You need full independence**, for example a legal requirement to hold your
  own data or a governance model that cannot share infrastructure with others.
- **You are a network, not a single group**: an association or federation with
  its own technical team that wants to host many communities under its own
  name.
- **You want to study or audit it**: researchers, journalists, security
  reviewers and students are welcome to run it to see how it works.
- **You are building something new on top of it**, such as an integration, a
  different governance experiment or a fork for another purpose.
- **You want to contribute.** Running a copy is the best way to fix bugs and
  build features that come back to everyone, including SpiritDAO.

### Reasons that point to joining instead

- **"We just want the tools."** Join. Every feature is available to pods today,
  and you can switch off the modules you don't need.
- **"We want to save money."** Running your own is rarely cheaper. You pay for
  the database, hosting, video, AI services and members' gas, plus someone's
  time to keep it secure.
- **"We don't have a developer."** Join. Setup takes days for an experienced
  developer and needs ongoing care afterwards.
- **"We want to accept tax-deductible donations."** Join and use SpiritDAO's
  fiscal sponsorship. A copy of the software does not come with a nonprofit.
- **"We want our own look and our own space."** Pods are autonomous, with their
  own membership, treasury, forums and roles, and Pod Faces lets you change how
  your pod looks. You can have your own space without your own servers.
- **"We want to be part of something larger."** The federation, the shared
  economy and the Community Fund only exist inside SpiritDAO.

Not sure? [Talk to us](https://spiritdao.org/contact.html) before you build
anything. One conversation is usually enough to tell which path fits.

---

## What running your own involves

This is the outline. The full, step-by-step version is the
[setup guide](https://github.com/thespiritdao/communityapp/blob/main/docs/SETUP.md).

1. **Decide the basics.** Who holds the keys, which legal pages you will
   publish, and what your copy will be called.
2. **Create accounts** with a database host (Supabase), Coinbase Developer
   Platform (member wallets and gas sponsorship), a hosting provider for the
   web app, and optional services for email, file storage, video and AI.
3. **Create the database** from the published blueprint, and set the
   sign-in configuration the guide describes.
4. **Create your server wallets** and decide how they are kept safe.
5. **Build your membership tree** in Hats Protocol and record your first
   communities.
6. **Deploy your contracts** in the order the guide gives. This is the longest
   step and is mostly manual today.
7. **Configure and deploy the app**, then turn on the optional services you
   want.
8. **Run the included security checks** against your deployment before you
   invite anyone.

Know before you start:

- The software runs on the **Base** network today; other networks need code
  changes.
- There is no one-command install. Expect several days for a first deployment.
- Read [known limitations](https://github.com/thespiritdao/communityapp/blob/main/docs/known-limitations.md)
  first. It lists design decisions and open items so there are no surprises.

---

## Contributing

- Read [CONTRIBUTING.md](https://github.com/thespiritdao/communityapp/blob/main/CONTRIBUTING.md).
  The known-limitations page has a list of good first issues.
- Open an issue before a large change so we can agree on the approach.
- **Found a security problem?** Do not open a public issue. Email
  **ron@spiritdao.org**, as described in
  [SECURITY.md](https://github.com/thespiritdao/communityapp/blob/main/SECURITY.md).

Contributions are licensed under the same AGPL-3.0 license. Fixes that land in
the code also reach every SpiritDAO pod.
