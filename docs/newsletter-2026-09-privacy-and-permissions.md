# Newsletter Blurb — Under the Hood: Your Profile Is Yours

*Draft for Paragraph. 2026-09-23. Safe to publish now: everything described
here is live in production (commits `8764adb6`, `355285f8`). Follows the
2026-09-09 "Stronger Front Door" piece. Deliberately says nothing specific
about the remaining permission work until it ships.*

---

## Your profile is yours

When you join SpiritDAO you fill in a profile. Some of it is meant for the
community: your name, photo, bio, what you're working on, what you're
looking for, your social links. Some of it is only there so the app can
serve you: your email, phone number, date of birth, and mailing address for
marketplace orders.

Until this week, the app kept those two kinds of information apart on the
screen but not underneath. The members directory only ever showed the
public part, but a signed-in member who knew how to query the database
directly could have read the private part of everyone's profile too.

That is fixed. Your private details are now readable by one person: you.
Everyone else, including other members, sees only the public profile. The
members page, chat, forum, and profile cards look exactly as they did.

There is one deliberate exception. When you buy something in the
marketplace that ships, the seller needs your address. The app now hands it
over only to the people fulfilling that specific order, and never your
email.

## Tightening the permissions

We also went through the rules that decide who can change what in the
database, table by table. Several were far looser than their names
suggested. One set labelled for "system use only" actually let any
signed-in member read and edit things like notifications and activity
records.

Those rules are now closed. System records can only be written by the
system, and your personal settings (notification preferences, your online
status, your reading progress, reports you file) can only be changed by
you. Before each change we tested it as an ordinary member: what should be
refused is refused, and what should work still works.

## Small things we fixed along the way

Tightening access showed us a few features that had quietly stopped
working after last week's changes, and we fixed them:

- Finishing onboarding now correctly records that you've joined. (No one
  signed up during the few days this was broken.)
- Proposal status on the Vote page loads again.
- Returning members signing in on a new device are recognised on the first
  screen again.

## What comes next

The next pass covers the parts of the app that move value: bounties,
treasury records, marketplace orders, and approvals. The goal is the same
standard we applied to sign-in: the server checks, it doesn't take the
browser's word for it. We'll share that when it's done.

As always, if something looks wrong or stops working for you, tell us.

— The SpiritDAO Team
