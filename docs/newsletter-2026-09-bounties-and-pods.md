# Newsletter Blurb — Under the Hood: Checking the Chain Before Money Moves

*Draft for Paragraph. 2026-09-24. Safe to publish now: everything described
here is live in production (commits `0a916a9f`, `fac35ffb`, `3c426dd3`,
`1a159e80`). Follows "Your Profile Is Yours" (2026-09-23). Deliberately
says nothing specific about work still in progress.*

---

## The chain is the source of truth. Now the app acts like it.

SpiritDAO runs on two kinds of records. The blockchain holds the ones that
matter most: who created a bounty, whose bid was accepted, how much sits in
escrow, who holds which role. The app's database holds a working copy of
those facts, plus everything around them, so pages load quickly and people
can collaborate before anything is signed.

This week we went through every place where the app acts on that working
copy when money or authority is involved, and made it check the chain first.

## Bounties

When a pod manager assigns a bounty or releases a payment, the app now reads
the bounty straight from the blockchain before asking them to sign. The bid
being accepted must belong to the person being approved. The payment must go
to the worker actually assigned on-chain, and it can't exceed what's still
in escrow. If anything doesn't match, the app stops and says why.

The $SELF earned for completed work follows the same rule. The server only
credits it for bounties that exist on-chain, to the worker assigned there,
approved by someone other than that worker.

Behind the scenes, each person can now change only the parts of a bounty that
their role actually touches. Bidders edit their own bids until they're
reviewed. Managers of the bounty's pod approve bids and mark progress.
Amounts and on-chain details are set once and then locked.

## Events

Registering for an event now records only you, never someone else. For paid
events, the server confirms your registration on-chain before it records a
ticket. Only an event's organizers can check people in, and every check-in
records who performed it.

## Pods

Deleting a pod is permanent, so it has always been meant to need agreement
from several of the pod's leaders. That rule now lives in the database
itself, not just on the screen. Each leader can add only their own approval,
proposals expire after a week, and a pod can't be removed until enough
current leaders have signed off.

## Why this matters

None of this changes how the app looks or feels. What changes is what stands
behind it. A community that asks its members to trust a shared treasury, a
shared tree of roles, and a shared record of work should be able to show
that the software can't be talked out of the rules the community agreed on.
Checking the chain before acting is how we show it.

## What comes next

Governance is next on the list. We'll share that when it lands.

As always, if something stops working or looks wrong, tell us.

— The SpiritDAO Team
