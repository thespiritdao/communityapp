# Newsletter — Managing Marketplace Orders, Fixed

*Draft. High-level, plain-language, member-facing. Companion to the marketplace
notes in `newsletter-self-spending.md`.*

---

## Order management now follows your pod role

A quick fix for our marketplace managers.

If you help run a pod's marketplace — adding products, and shipping them when
they sell — you may have noticed the **Manage Orders** tab go missing. We've
fixed it.

### What happened

Order management used to check for a couple of specific, behind-the-scenes
tokens to decide who could see and fulfill orders. That check had drifted out of
sync with how the rest of the platform works, so some managers lost access to
the orders view even though their pod role clearly said they should have it.

### What we changed

Managing orders now follows the **same pod permission as managing products**.
If your role has **Marketplace Manage** in a pod, you'll see the **Manage
Orders** tab and can work through orders end to end — review them, mark them
preparing, shipped, and delivered — using the shipping details buyers already
provide at checkout.

In short:

- **Buyers** still see **My Orders** to track their own purchases — no change.
- **Pod managers** (anyone with the Marketplace Manage role) see **Manage
  Orders** and can fulfill what their pod sells.
- One consistent rule everywhere: the permission that lets you add products is
  the same one that lets you ship them.

Nothing about how you set roles changes — if your pod already granted Marketplace
Manage to a role, those folks now correctly have order access too.

*With gratitude,*
*The SpiritDAO team*
