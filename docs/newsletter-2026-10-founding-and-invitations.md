# Newsletter Blurb — Start a Pod on Your Own, Invite Co-Leaders, and Check-In Codes You Can Trust

*Draft for Paragraph. 2026-10-01. Safe to publish now: everything described
here is live in production (commits `82d89fc9`, `bbf586f1`, `13ed5e8a`,
`5b3e1d9a`). Follows "Clearer Sign-In, a Second Key Retired, and Leadership
by Vote" (2026-09-29). Says nothing specific about the few items still open.*

---

## Start a pod on your own

Every community begins with someone willing to go first. Until now, creating
a pod asked you to name several leaders up front, which doesn't fit how
communities actually start, and it meant other people's names could be added
without them knowing.

Now you can found a pod by yourself. When you create a pod, you're its
leader from the start. If you want co-leaders, you can still add them in the
form or invite them later from the pod page, and they'll be invited rather
than signed up.

## Co-leaders join by accepting

Being a pod leader is a real commitment: you help welcome members, run
governance, and look after shared funds. So nobody becomes a leader just
because someone typed their name in.

- **An invitation, not an assignment.** When you invite someone to co-lead,
  they get a notification. On the pod page they'll see "You're invited to
  co-lead," with Accept and Decline buttons.
- **They become a leader only after accepting.** If they decline, the
  invitation simply goes away.
- **Bigger pods decide together.** In a pod with one leader, that leader's
  invitation is enough. In a pod with several leaders, inviting counts as
  your vote, and a majority of leaders must agree, the same rule that applies
  to leadership applications.

Leaders can see who hasn't replied yet, right on the pod page.

## Event check-in codes you can trust

When you register for an event, the app gives you a check-in QR code to show
at the door. Those codes are now signed by our server, and the server checks
each code when an organizer scans it. It confirms that the code is genuine,
that it's for this event, and that it belongs to the person showing it. A
code can't be copied, edited or made up.

Nothing changes for you: your code is on the event page, as before. If you
saved a code a day or more ago, just reopen the event page for a fresh one.

## A safer map

The Places map, the shared map some pods use for meeting spots, land and
partners, now runs on the latest version of its mapping software. The update
closes a security issue rated critical in the older version. Your pod's map
looks and works the same.

## Less code we don't use

We removed a library for a third-party voting service that SpiritDAO never
used. Our proposals and votes have always run on our own system. Removing it
leaves less to maintain and clears out several outdated components it brought
along.

---

*Each change was tested against the live system before going out, and the
full production checks passed afterward.*
