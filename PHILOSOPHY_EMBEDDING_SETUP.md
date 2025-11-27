# Temporal Naturalism Embedding Setup

## Current Issue

Your philosophy queries are being **correctly routed** (you see "Philosophy" badge), but they error because:

**The `temporal-naturalism` namespace in Pinecone is empty.**

You successfully ran `npm run embed:spiritdao` which populated the `spiritdao` namespace, but you haven't populated the `temporal-naturalism` namespace yet.

---

## What You Need

1. **Source documents** for Temporal Naturalism philosophy:
   - Where are they? (folder path, website, PDFs, etc.)
   - What format? (markdown, txt, pdf, docx, etc.)
   - How many documents?

2. **Embedding script** (I'll create this once I know your source)

3. **Run the script** to populate Pinecone's `temporal-naturalism` namespace

---

## Questions for You

**Please provide:**

1. **Document location:**
   - [ ] Files in a folder (path: ________________)
   - [ ] Website/online source (URL: ________________)
   - [ ] PDFs in a folder (path: ________________)
   - [ ] Other: ________________

2. **Document format:**
   - [ ] Markdown (.md)
   - [ ] Plain text (.txt)
   - [ ] PDF (.pdf)
   - [ ] Word (.docx)
   - [ ] HTML/Web pages
   - [ ] Other: ________________

3. **Size/quantity:**
   - Number of documents: ________________
   - Approximate total size: ________________

4. **Content structure:**
   - [ ] Academic papers/essays
   - [ ] Book chapters
   - [ ] Blog posts
   - [ ] Q&A format
   - [ ] Mixed content
   - [ ] Other: ________________

---

## What Happens Next

Once you provide the above info, I'll:

1. Create `scripts/embed-temporal-naturalism.ts`
2. Add npm script: `npm run embed:philosophy`
3. You run it to populate Pinecone
4. Philosophy queries will work!

---

## About DAO Documentation Expansion

You mentioned wanting to expand DAO docs. Current docs are in:
```
src/guides/user/
├── 01-getting-started.md
├── 02-pod-management.md
├── 03-governance-voting.md
├── 04-bounties-system.md
├── 05-events-calendar.md
├── 06-forum-discussions.md
└── 07-marketplace-shopping.md
```

**To expand:**
1. Edit existing guides (add more details, examples, screenshots)
2. Add new guides (e.g., `08-treasury-management.md`)
3. Run `npm run embed:spiritdao` again to update Pinecone

**What DAO topics need more coverage?**
- Treasury management?
- Advanced governance features?
- Role management?
- Module deployment?
- Integration guides?
- Troubleshooting?

---

## Testing After Setup

Once both namespaces are populated:

**Test DAO queries:**
- "How do I create a pod?"
- "Tell me about the bounties system"
- "How does voting work?"

**Test Philosophy queries:**
- "What is temporal naturalism?"
- "How does temporal naturalism view time?"
- "What are the eight dignities?"

Both should work! The AI will automatically route to the correct knowledge base.

---

## Routing Logic

The routing service (GPT-4o-mini) classifies queries:

**SpiritDAO triggers:**
- "pod", "bounty", "governance", "voting", "treasury"
- "DAO", "on-chain", "blockchain", "wallet"
- "forum", "event", "marketplace"
- "How do I...", "How to..."

**Temporal Naturalism triggers:**
- "philosophy", "temporal", "naturalism", "metaphysics"
- "theology", "time", "causality", "existence"
- "God", "sin", "ethics", "morality"
- "eight dignities", theological terms

The system is working - you just need to populate the philosophy namespace!
