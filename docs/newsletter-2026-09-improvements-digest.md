# Newsletter — September 2026: Ten Days of Fixing What We Found

*Draft for Paragraph. 2026-09-18. Digest of the whole run from the 2026-09-08
review through today; supersedes the three unsent September drafts
(`login-verification`, `docs-and-repairs`, `authority-hardening`) if only one
letter goes out. Everything described is deployed to production. Editable copy:
https://claude.ai/code/artifact/7b053121-8479-44e1-b039-bd81399b0cc7*

---

## Ten days of fixing what we found

Early this month we took the Community App apart and read every subsystem
against its own documentation. That review produced a ranked list, and for
the last ten days we have been working down it. This is what landed: a good
deal of it under the hood, some of it things you will see, and one thing you
can help us test.

## Things you will notice

**The app talks back now.** Every "Saved", "Signed" and "Could not connect"
message in the app had been going nowhere since launch; the component that
shows them was never on the page. It is now. If you ever gave up on a button
because nothing happened, try it again.

**Reminders arrive.** Voting reminders, approval notices to leaders and
agent-subscription reminders were being silently dropped by the database.
They deliver.

**Surveys count.** Results that showed 0% for every option are fixed, and
every answer recorded before the fix was repaired. Nobody needs to vote again.

**Video calls start.** Meetings had failed for everyone since May because of a
swapped credential pair and a security policy that blocked our own meeting
server. Both fixed, and the server's keys were rotated this week as a
precaution.

**Bounty notifications land on the bounty.** Every "View" link had pointed at
a page that never existed.

**Removing a member works.** A leader can now remove someone from a pod and
the removal is real on-chain, through a new eligibility contract. Re-approving
the same person later lifts it in one step.

**Signing an agreement is a transaction on Base.** Your signature is
verifiable by anyone, and gas is sponsored. Agreements do not yet gate access
to a role; that switch will be thrown deliberately, with notice.

**Linking an outside wallet works for the first time.** MetaMask and similar
wallets could be connected to your account since July, but the final
confirmation step had rejected every valid signature because of a timestamp
formatting mismatch. No one had ever succeeded. Fixed today.

Also this fortnight: the password vault opens, checkout failures explain
themselves, referendums distinguish "not enough people voted" from "the
community said no", the map form works on a phone, the public agent monitor
reads on a phone, and the user guides carry 83 screenshots.

## Under the hood

Most of the ten days went into one question: is there any place where a
member could give themselves authority by writing to the database instead of
holding the right hat on-chain? The answer was yes in several places, and
they are closed.

- **Sign-in is verified, not trusted.** Every sign-in now carries a
  short-lived proof from Coinbase that our server checks before opening a
  session. Onboarding, invite codes and device linking use the same check.
- **The chain decides; the database remembers.** Every server decision about
  whether you lead, manage or belong to a pod starts from your hat balances on
  Base. The eight different pieces of code that used to answer that question
  are now one.
- **The browser no longer writes membership.** Approvals, hat claims, leader
  records and removals go through the server, which confirms the hat on-chain
  first.
- **Every endpoint needs a session.** Seven routes that accepted anonymous
  requests refuse them, and notifications are readable only by their
  recipient.
- **Agents fail closed.** If the agent registry cannot be reached, the app now
  assumes "agent" rather than "human"; an agent cannot post until the chain
  confirms its registration.
- **Dead treasury code is gone.** Sixteen functions, two files, one API route
  signed with an admin key, and one page that pointed at a retired contract
  all called the treasury directly. None had a caller and all would have been
  refused by the current contract. Removed, so the only spend path left is
  the one the multisig proxy guards.

We run a hostile-member script after every deployment. It signs in as an
ordinary member and tries every escalation above, then as a leader to confirm
the legitimate versions still work. As of this letter every hostile attempt is
refused and every legitimate flow passes.

## Your email is yours

We want to be plain about one finding. Until this week, any signed-in member
could read any other member's email address, and the phone number, street
address and date of birth they had entered on their profile. The app never
displayed them, but the database rules allowed a member's browser to ask for
them, and a browser can be made to ask.

We found no sign anyone did. We also could not have promised that.

As of today, member-facing reads go through a profile view that simply does
not contain those columns. Your own profile still shows you your own details,
and the server still has what it needs to send you a receipt or a digest. A
check now runs on every build and fails it if a new piece of code reaches for
a private column. In about a week, once we are sure nothing else depended on
the old behaviour, the database itself will refuse to hand another member's
private columns to anyone but that member.

One exception, on purpose: when you buy something in the marketplace, the
seller can see your phone number and shipping address so they can send it.
Your email is not shown to them; contact is through in-app messages.

## What comes next, and one thing you can help with

**Help us test:** if you use SpiritDAO on two devices, sign in on the second
one. You will be asked for a six-character code; issue it from the first
device and enter it. Tell us in the forum whether it worked and whether you
were asked again the next time you signed in. Our scripts can test everything
about this flow except that last step, which needs a real second Coinbase
session.

**Three decisions still ahead of us, and we would rather make them in the
open:**

1. Whether to make signing a pod's agreement a real condition of membership.
   Turning it on makes every unsigned member ineligible at once, so it waits
   on signature coverage.
2. What a "binding" treasury vote should do. Today a passed vote still needs
   leaders to build and sign the transaction by hand. Either the app builds it
   automatically on approval, with leaders still signing, or the tier is
   relabelled advisory.
3. How quorum should be counted. Today it is measured against every member
   who ever joined, so a growing pod can fail quorum forever. Counting members
   active in the last 90 days is the proposal, and since it changes how your
   votes resolve it will come to you as one.

After that, the smaller things: a proper settings page for linked devices, a
typecheck clean-up so a broken type can never reach production, and the
feature requests several of you sent in.

We would rather tell you what the app enforces than what we meant it to.

— The SpiritDAO Team

*The audit, the hostile-member script, the wallet-linking test and every
migration are in the repository. Questions in the forum, as always.*
