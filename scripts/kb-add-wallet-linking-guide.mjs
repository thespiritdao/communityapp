// scripts/kb-add-wallet-linking-guide.mjs — one-off:
// 1. Create a "Guides" category for the Treegens DAO pod + insert the
//    external-wallet-linking guide as a markdown knowledge item.
// 2. Fix two orphaned global items (category_id NULL → correct category).
// Idempotent: skips anything that already exists.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const TREEGENS_POD_ID = 'a4f2eb44-c2d5-4c49-8629-f6f818960f98';
const GUIDE_TITLE = 'Linking Your External Wallet ($TGN)';

// ContentDisplay renders markdown items via innerHTML, so store clean HTML.
const GUIDE_HTML = `
<h1>Linking Your External Wallet</h1>
<p>Your $TGN counts toward Treegens governance on SpiritDAO — both pod eligibility and voting. But your $TGN probably lives in your own wallet (MetaMask, Rabby, Coinbase Wallet), not in the SpiritDAO wallet created for you when you joined.</p>
<p><strong>Wallet linking</strong> lets you prove you own that outside wallet, so the $TGN in it counts — <em>without moving anything</em>. You sign one free message. Your tokens never leave your wallet. SpiritDAO can never touch, move, or spend anything in it — the app only <em>reads</em> the balance.</p>
<h2>What counts once you've linked</h2>
<ul>
<li>$TGN held in your SpiritDAO wallet</li>
<li>$TGN held in every wallet you've linked</li>
<li>$TGN you've staked on Hydrex (from any of those wallets)</li>
</ul>
<p>All of it is added together whenever Treegens checks eligibility or opens a vote. Voting stays one-person-one-vote — tokens affect <em>whether</em> you can vote, never how much your vote counts.</p>
<h2>Before you start</h2>
<ul>
<li>Use a <strong>desktop browser with your wallet extension installed</strong> (MetaMask, Rabby, or Coinbase Wallet extension). On a phone, open app.spiritdao.org inside your wallet app's built-in browser (e.g. MetaMask app &rarr; Browser tab) — a regular mobile browser can't see your wallet.</li>
<li>Make sure the account you link is the one that actually holds your $TGN. You can link more than one wallet.</li>
<li>Linking is <strong>free</strong>. You sign a message, not a transaction. If your wallet ever asks for gas or a payment during this, stop — that's not our flow.</li>
</ul>
<h2>Step by step</h2>
<ol>
<li>Log in at <a href="https://app.spiritdao.org" target="_blank" rel="noopener">app.spiritdao.org</a>.</li>
<li>From the home screen, tap the <strong>Identity</strong> card.</li>
<li>Scroll down to the <strong>Linked Wallets</strong> section.</li>
<li>Click <strong>Link external wallet</strong>.</li>
<li>Your browser wallet pops up asking to <strong>connect</strong> — pick the account that holds your $TGN and approve.</li>
<li>The wallet then asks you to <strong>sign a message</strong> proving you own this address. Signing is free and moves nothing. Click <strong>Sign</strong>.</li>
<li>Done. The wallet now appears in your Linked Wallets list with an <strong>External</strong> tag.</li>
</ol>
<h2>Check that it worked</h2>
<p>Open the <strong>Treegens pod page</strong>. Near the top you'll see a $TGN balance chip. It should now show your <strong>combined</strong> total and say "governance eligibility &middot; incl. linked wallets." If the number matches what you hold across your wallets, you're set.</p>
<h2>Removing a wallet</h2>
<p>In <strong>Identity &rarr; Linked Wallets</strong>, click <strong>Remove</strong> next to any external wallet. Its balance stops counting immediately. You can re-link it any time.</p>
<h2>Common issues</h2>
<ul>
<li><strong>"No browser wallet detected"</strong> — install MetaMask (or similar) as a browser extension, or use your wallet app's built-in browser on mobile.</li>
<li><strong>Connected the wrong account</strong> — disconnect in the wallet extension, switch accounts there, then click Link external wallet again.</li>
<li><strong>"This wallet is already linked to another account"</strong> — each wallet can only link to one SpiritDAO account. Remove it from the other account first.</li>
<li><strong>Balance chip doesn't update</strong> — refresh the Treegens pod page, and confirm the wallet shows in Identity &rarr; Linked Wallets.</li>
<li><strong>Signed but linking failed</strong> — the signature request expires after a few minutes. Just try again.</li>
</ul>
<h2>Privacy &amp; security, plainly</h2>
<ul>
<li>We store your wallet <strong>address</strong> (which is public on the blockchain anyway) — nothing else.</li>
<li>The signature proves ownership <strong>once</strong>. It gives no ongoing permission, allowance, or access to your funds.</li>
<li>Your $TGN is only ever a <strong>governance signal</strong> — never involved in bounties, the marketplace, payments, or anything financial in the app.</li>
<li>You can remove a linked wallet at any time.</li>
</ul>
`.trim();

// ── 1. Treegens category + guide item ──────────────────────────────
let { data: cat } = await supabase
  .from('knowledge_categories')
  .select('id')
  .eq('pod_id', TREEGENS_POD_ID)
  .eq('name', 'Guides')
  .maybeSingle();

if (!cat) {
  const { data, error } = await supabase
    .from('knowledge_categories')
    .insert({
      pod_id: TREEGENS_POD_ID,
      name: 'Guides',
      description: 'How-to guides for Treegens members',
      icon: '📖',
      sort_order: 1,
      is_public: true,
      created_by: 'system',
    })
    .select('id')
    .single();
  if (error) throw error;
  cat = data;
  console.log('Created Treegens "Guides" category:', cat.id);
} else {
  console.log('Treegens "Guides" category exists:', cat.id);
}

const { data: existing } = await supabase
  .from('knowledge_items')
  .select('id')
  .eq('category_id', cat.id)
  .eq('title', GUIDE_TITLE)
  .maybeSingle();

if (!existing) {
  const { error } = await supabase.from('knowledge_items').insert({
    category_id: cat.id,
    pod_id: TREEGENS_POD_ID,
    title: GUIDE_TITLE,
    description:
      'Count the $TGN in your personal wallet (MetaMask etc.) toward Treegens eligibility and voting — sign one free message, tokens never move.',
    content_type: 'markdown',
    content_text: GUIDE_HTML,
    is_public: true,
    view_count: 0,
    sort_order: 1,
    created_by: 'system',
  });
  if (error) throw error;
  console.log('Inserted guide item:', GUIDE_TITLE);
} else {
  console.log('Guide item already exists:', existing.id);
}

// ── 2. Fix orphaned global items (category_id NULL) ────────────────
const FIXES = [
  { title: 'Using Invite Codes', category: 'Getting Started' },
  { title: 'Members Directory', category: 'Identity' },
];
for (const fix of FIXES) {
  const { data: target } = await supabase
    .from('knowledge_categories')
    .select('id')
    .is('pod_id', null)
    .eq('name', fix.category)
    .maybeSingle();
  if (!target) {
    console.warn(`Category not found for fix: ${fix.category}`);
    continue;
  }
  const { data: updated, error } = await supabase
    .from('knowledge_items')
    .update({ category_id: target.id })
    .is('category_id', null)
    .eq('title', fix.title)
    .select('id');
  if (error) throw error;
  console.log(
    `Orphan fix "${fix.title}" -> ${fix.category}: ${updated?.length ?? 0} row(s)`,
  );
}

console.log('Done.');
