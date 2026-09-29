# Newsletter Blurb — Under the Hood: Clearer Sign-In, a Second Key Retired, and Leadership by Vote

*Draft for Paragraph. 2026-09-29. Safe to publish now: everything described
here is live in production (commits `1ab3b6d9`, `ca061dbc`, `5e764610`,
`5d2ce643`, `e9862f6b`). Follows "An Old Key Retired, and the Last Doors
Checked" (2026-09-25). Says nothing specific about the few items still open.*

---

## Sign-in now tells you when your browser is blocking it

When you create an account or sign in, your browser talks directly to
Coinbase, which creates your account's wallet. Some privacy tools block that
conversation before it starts: tracker blockers, strict browser privacy
modes, some VPNs and network filters. Until now, the app only said
"Network Error. Please try again," which left people stuck.

Now, if that happens, the app says what's going on: your browser or network
is blocking sign-in. It also tells you what to try: turn off tracker
blocking or privacy protection for this site (in Firefox or Brave, that's
the shield icon in the address bar), pause ad-blocker extensions, or use a
different browser. Thank you to the new member whose sign-up attempt helped
us find this.

## A second key, retired

Last week we wrote about retiring an old sign-in key that had been saved in
the app's private code history. While reviewing that history again, we found
one more: the key the app uses to talk to Coinbase, saved there since April
2025. The code has always been private, but a key stored where it shouldn't
be gets replaced.

We made a new key and tested it before switching production over. Then we
confirmed that sign-in and the app's other Coinbase connections work, and
deleted the old key. It is now refused. We also added a safeguard that stops
key files like this one from being saved into the code again.

As before, you didn't have to do anything.

## Software updates

We updated the software the app is built on, including the framework that
serves every page. That update fixed several published security issues,
including four rated critical. We also removed a large amount of code the
app no longer uses: old libraries and leftover folders from the toolkit the
app was originally built from. That leaves less to maintain and less that
could go wrong.

## Notifications have a speed limit

Notifications are how the community reaches you: proposals, events, pod
news. They can also reach your phone as push alerts, so they should never
become a way to flood someone. There is now a limit on how many
notifications any one member can send in an hour:

- **20 per hour to the same person.** Nobody can bury someone else in
  alerts.
- **1,000 per hour in total.** That's roughly ten times the biggest real
  announcement we've seen, so a leader announcing a proposal to a whole pod
  won't come close.

Reminders and other notices the app sends itself aren't affected.

## Pod leadership is decided together

Being a pod's leader comes with real responsibility: approving members,
running governance, and, with enough leaders agreeing, deleting the pod.
Until now, the list of a pod's leaders could be edited more freely than it
should have been. Here's what changed:

- **New leaders join through an approved leader application.** Nobody can
  add someone, or a second account of their own, to the leaders list
  directly.
- **Leader applications need the leaders' votes.** An application is
  approved only when at least half of the pod's current leaders agree. The
  final "approve" click counts as a vote. In a pod with a single leader,
  that leader still decides, just as before.
- **Leaders can step down, but can't remove each other from the list.**
  Removing someone from a leadership role goes through the members panel,
  which first checks the blockchain record of who holds the role.
- **A pod's founder can't be changed.**

Day to day, nothing looks different. These rules sit in the database
itself, so they hold no matter how someone tries to make the change.

---

*Each change was tested against the live system before going out, and the
full production checks passed afterward.*
