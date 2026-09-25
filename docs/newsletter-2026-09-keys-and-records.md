# Newsletter Blurb — Under the Hood: An Old Key Retired, and the Last Doors Checked

*Draft for Paragraph. 2026-09-25. Safe to publish now: everything described
here is live in production (commits `1a92b304`, `d5a5e8c8`, `116edc62`,
`80ad3fb6`, `aa19cdf3`). Follows "Checking the Chain Before Money Moves"
(2026-09-24). Says nothing specific about the few small items still open.*

---

## An old key, retired

Every app like ours has a master key for signing people in. Ours had a
problem: an early copy of the app's configuration, including that key, was
saved into the project's code history back in December 2024. The code has
always been private, which limited who could ever see it, but a key that has
been written down somewhere it shouldn't be is a key you replace.

Replacing it isn't just a matter of changing a password. Anything that
depended on the old key would stop working the moment it was gone, including
signing in. So over the past two weeks we moved everything off it first:
sign-in, linking a new device, the community agent, and dozens of places in
the app that check who you are. Sign-in is now handled by Supabase's own
modern signing keys, whose private half never leaves their servers.

This week we retired the old key for good. We revoked it, confirmed that
anything signed with it is now refused, both by Supabase and by the app
itself, and removed it from the app's settings. The two other credentials that appeared in that same old history, a
database password and an older access key, had already been replaced.

You didn't have to do anything, and you shouldn't have noticed anything. If
you were signed in, you stayed signed in.

## Links in your notifications stay home

Notifications, both in the app and in the daily email digest, often carry a
link back to the thing they're about. Those links are now required to point
inside the app, and that rule is enforced at every step: when a notification
is created, when the email is built, and when your phone opens a push
notification. A notification can't send you anywhere else.

Members can also only send notifications as themselves. The "system" label
is reserved for the app itself.

## The records behind the records

The last few changes this week went through the app's working records one
more time, the ones that aren't money or votes but still shape what people
see and trust:

- **Membership applications** can only be filed by the person applying, and
  only a pod's leaders decide them. Vote counts are worked out from who
  actually voted.
- **Treasury history** is written by pod leaders as themselves, and once a
  transaction is confirmed its record can't be edited.
- **Event badges, bid reviews and approval records** can only be written by
  the organizers, managers or approvers they belong to.
- **Chat moderation** belongs to the people who hold moderation in that
  pod's chat.
- **Forum access rules**, meaning which tokens open which categories, can
  no longer be changed from the browser at all.
- **Survey answers** are private again: only the survey's results view shows
  them, the way it was always meant to.

## Where that leaves things

Over these two weeks we went through every place the app writes information
and asked the same question each time: who should be allowed to do this,
and does the software actually hold to that answer? As of today, it does,
for every table in the app. Where money, votes or authority are involved,
the app now checks the blockchain before it acts.

There are a few small refinements still on our list, and we'll mention them
as they land. As always, if something stops working or looks wrong, tell us.

— The SpiritDAO Team
