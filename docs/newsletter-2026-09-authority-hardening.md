# Newsletter — September 2026: Who Decides Who You Are

*Draft for Paragraph. 2026-09-16. Commits `4bf764c5` through `c827450e` are
deployed to production, with five database migrations applied by hand.
Follows the Guides & Repairs letter (`newsletter-2026-09-docs-and-repairs.md`).
Companion: the full audit and checklist at `App/APP_AUDIT_2026-09-15.md`.*

---

## The question we asked

After the repair run in the last letter, we stopped fixing individual screens
and asked a single question of the whole app:

> Is there any place where a member could give themselves authority by writing
> to the database, rather than by holding the right hat on-chain?

The honest answer was yes, in several places. This letter is about closing
them.

Some background for anyone new. Every role in SpiritDAO — member of a pod,
leader of a pod, seat on the Executive — is a **hat**: a token on Base, issued
through Hats Protocol, that you either hold or do not. That is the source of
truth. The database is supposed to be a cache of it, so the app can draw a
members list without asking the blockchain every time.

The problem was that in a handful of places the app trusted the cache over the
chain, and let the browser write to the cache.

## What could have gone wrong

We want to be precise here, because "security audit" can mean anything.

- A signed-in member could send the database a request to change their own
  row from *member* to *leader*, or add themselves to a pod they had never
  joined. The database's row-level rules did not stop it. Nothing in the app
  offered a button for this — but the rules are what matter, not the buttons.
- Accountability signatures could be inserted on someone else's behalf.
- Seven server endpoints — notifying the Executive, requesting a claim,
  cancelling a bounty, subscribing to an agent, and others — accepted requests
  with no session at all, and believed whatever wallet address the request
  body claimed to be.
- Notifications were readable across accounts.

We found no evidence anyone had done any of this. We also could not have
promised that, which is the point.

## What changed

**The chain decides; the database remembers.** Every server-side decision
about whether you lead a pod, manage a pod, or hold a role now starts by
reading your hat balances from Base. The database is consulted only as a
fallback when the chain cannot be reached — and in that case it can only
*deny*, never grant, anything the chain has not already confirmed.

**The browser no longer writes membership.** Approving an application,
claiming a management hat, recording a new pod's leaders, removing a member:
each of these now goes through the server, which checks the hat on-chain
before touching a row. If you approve someone and the mint has not been mined
yet, the server says "not yet" and the page quietly retries for half a minute.
Then it records the membership. You may see a few `409` lines in a browser
console during that wait; they are the retries, not failures.

**Signatures are recorded only when proven.** A pod agreement signature is
written to the database only after the server confirms the signature exists
on-chain, or verifies the signed message itself. There is no longer a path
where the browser tells the database "they signed" and the database believes
it.

**Your notifications are yours.** Only the recipient can read a notification;
only the sender can send one as themselves.

**Every endpoint needs a session.** The seven routes that accepted anonymous
requests now refuse them.

Across the eight different places the app used to answer "is this person a
pod leader?" — each with its own slightly different logic — there is now one
resolver. They all agree, because they are all the same code.

## How we know it holds

We wrote a script that plays a hostile member. It signs in with a real
member's session and tries every escalation listed above: promote itself,
join the Executive, forge a signature, read another person's inbox, hit each
unauthenticated route. Then it plays a real leader and confirms the legitimate
versions of those same actions still work — a leader can still record a
member, still send an approval notice, a member can still read their own
inbox.

We run it after every deployment. As of this letter: every hostile attempt is
refused, every legitimate flow is allowed, and every authority decision the
server makes matches the chain.

This is not a browser test. Someone still has to click through the screens,
and that is how the next section happened.

## Clicking through found two old bugs

**Removing a member has never worked on-chain.** The remove button tried to
transfer the member's hat to the zero address. Hats Protocol refuses that. The
only other way to take a hat from someone is for the hat's *eligibility
module* to declare them ineligible — and our module has no way for a leader
to say so. This has been true since launch; the button showed a vague error
about permissions. It now tells you the truth: on-chain removal is not
available yet, a member can leave by renouncing their hat, and leader-driven
removal is coming in the next phase.

**Some notifications were never delivered.** The notification table has no
`priority` column. Eight parts of the app write one anyway — including
membership-approval notices to leaders, voting reminders, and the
agent-subscription reminders. Every one of those inserts has been silently
rejected for as long as the code has existed. One migration added the column;
they deliver now. If you have wondered why you never got a reminder to vote,
this is why.

## One more thing we got wrong and then right

For about a day this week, the app's contract configuration differed between
the code on our machine and the code in production, and we gave ourselves the
wrong advice about which side to trust. The addresses are now aligned
everywhere, and a diagnostic page lets us confirm from the running server —
not from a dashboard — which contracts a deployment actually uses. Two newer
contract deployments were found that had never been rolled out to anyone;
they hold nothing and are noted for the next phase.

## What comes next

The next phase is on-chain: an eligibility module that lets a pod leader
revoke a hat and that enforces agreement signing as a real condition of
membership; the agent guard failing *closed* rather than open when the
registry is unreachable; and the remaining places where a governance vote is
labelled "binding" without yet being enforced by a contract.

We would rather tell you what the app enforces than what we meant it to.

---

*The audit document, the hostile-member script, and every migration are in
the repository. Questions in the forum, as always.*
