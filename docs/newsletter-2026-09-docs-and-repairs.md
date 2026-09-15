# Newsletter — September 2026: The Guides Get Pictures, and a Long Repair Run

*Draft for Paragraph. 2026-09-12. Commits `4bf77c73` through `842f213e` are
deployed to production. Follows the Journal & Places letter
(`newsletter-2026-09-journal-and-places.md`).*

---

## Every guide now shows you the screen

The user guides have always told you where to click. Now they show you.

Eighty-three screenshots have been captured and placed through the guides —
the bounty board, the survey builder, the vault, the journal, the map, the
constitution monitor, the appearance picker. They appear in all three places
the guides live: the **Knowledge Base inside the app**, the **docs on
spiritdao.org**, and the guide files themselves.

If you have ever read "open your pod's Manage page → Modules tab" and wondered
whether you were looking at the right thing, you no longer have to guess.

Three shots are still to come: the vault's first-time prompt, signing a pod
agreement, and starting a video call from a direct message.

## Writing the guides showed us what was broken

Something worth saying plainly: taking pictures of every screen in the app is
an excellent way to find out which screens are wrong. Most of what follows was
discovered by someone trying to photograph a feature and finding it did not
behave as the guide claimed.

### The app was failing silently. Everywhere.

This is the big one, and it explains a lot of past frustration.

The app is full of messages meant to tell you what just happened — "Saved",
"Agreement signed", "Could not connect to the treasury". None of them have
ever appeared on screen. The component responsible for displaying them was
never added to the page, so every one of those messages, from 59 different
parts of the app, went nowhere.

The practical effect: when something failed, you saw nothing at all. A button
that looked like it did nothing may have been reporting a real error into the
void. That is now fixed, and the app tells you what is happening — including
when it goes wrong.

If you ever gave up on something because clicking produced no response, it is
worth another try.

### Survey results showed 0% for every option

A survey with a clear winner displayed "1 total response" and then 0% for
every choice. The vote was recorded correctly; the tally simply could not
match the stored answers because of how they were saved. Fixed, and every
answer recorded before the fix has been repaired — no one needs to vote again.

Option percentages are also measured properly now: against the people who
answered *that question*, rather than everyone who opened the survey.

### "Your community voted not to renew this agent" — when it had voted yes

A renewal referendum passed unanimously, 2 in favour and 0 against, and the
agent was switched off anyway. The vote met the approval threshold but missed
quorum — only 2 of 50 members voted, where 15 were needed — and the app
reported a turnout failure as a defeat.

It now says what actually happened, with the numbers, and separates "the
community declined" from "not enough people voted". Kairos is running again.

### The password vault would not open

Setting up vault access failed with a single word: "forbidden". A Coinbase
embedded wallet is really two addresses — one that signs, one that transacts —
and only one of them had ever been recorded against your account. The vault
needs the other. Both are now registered when you sign in.

### Bounty notifications led nowhere

Every notification about a bounty — your bid approved, work submitted, a
dispute filed — linked to a page that does not exist, and has never existed.
Clicking **View** produced a 404.

Those links now open the bounty itself, with the right card expanded. Old
notifications sitting in your history work too, not just new ones.

### Checkout failed without telling you

A marketplace purchase could fail with nothing shown on screen. The cart now
explains what went wrong, and resolves your pod's treasury address directly
from the blockchain rather than trusting a stored value that had drifted out
of date.

### Linking an external wallet

The button offered to link one specific brand of wallet, because it named
whichever wallet your browser happened to announce. It now reads "Link external
wallet" and works with any of them. A locked wallet gets a plain explanation
instead of "An internal error has occurred".

### Video calls

Meetings failed to start for anyone. Two causes: a credential pair for our
self-hosted meeting server had been entered the wrong way round since May, and
the app's security policy did not permit connections to that server. Both
fixed.

### Places on a phone

The form for adding a place to your pod's map could not be completed on a
phone — the buttons sat below the fold. It is now full-screen on mobile with
the controls always reachable.

## Agreements are becoming real signatures

Pod agreements have until now been signed inside the app, with the record held
in our database. You had to trust us that the signature existed.

Signing an agreement is now a **transaction on Base**. A signature is recorded
on the blockchain, where anyone can verify it independently — including after
we are gone from the picture. Gas is sponsored, so signing costs you nothing.

*(Editor's note before publishing: on-chain* creation *of an agreement is not
yet live on production — the eligibility module there needs an admin claimed
for each pod's hat first. Keep this paragraph to signing only until that is
done. See APP_AUDIT_2026-09-15 F12/F13.)*

To be precise about what this does and does not do yet: agreements are recorded
and verifiable, but they do not yet *gate* access to a role. Turning that on
would immediately make every member who has not signed ineligible for their
role, which is not a thing to do casually to a live community. It will happen
deliberately, with notice, once signature coverage is high enough to be fair.

## Corrections to the guides themselves

Three places where the documentation described something that does not exist:

- The governance guide described a **delegation page**. There is no such page;
  only self-delegation exists. Rewritten.
- The vault guide called setup a **one-time** step. Your key is deliberately
  discarded when you close the tab, so the prompt returns each session. That is
  a security property, not a bug — nothing is left behind on a shared computer —
  and it is now described accurately.
- The **$SELF** guide pointed at a holdings screen that was never built.

We would rather say what the app does than what we meant it to do.

## The public agent monitor works on a phone now

`/constitution` shows live, on-chain proof that our AI agents hold no vote, no
governance role and no participation standing. It was unreadable on a phone
and effectively unfindable. It now reads properly on a small screen, and each
pod's agent settings link straight to the proof for **that** agent.

An accountability page nobody can reach is not accountability.

---

*Questions, or something still not working the way the guide says? Tell us in
the forum — the guides are only as good as the corrections we get.*
