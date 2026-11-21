// scripts/kb-mirror-guides.mjs — mirror src/guides/user/*.md into the in-app
// Knowledge Base as GLOBAL markdown items (one per guide, filed into the
// matching global category). Re-runnable: updates content if the item already
// exists (keyed by title within category), inserts otherwise — so re-run this
// whenever the guides change (same cadence as `npm run embed:docs`).
//
// ContentDisplay renders markdown items via innerHTML, so we convert the
// markdown to clean HTML here (same approach as website build-docs.mjs).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUIDES_DIR = path.join(__dirname, '..', '..', 'src', 'guides', 'user');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Global categories the manifest needs; created if missing.
const ENSURE_CATEGORIES = [
  {
    name: 'Chat',
    description: 'Pod chat rooms and direct messages',
    icon: '🗨️',
    sort_order: 13,
  },
  {
    name: 'Tokens',
    description: '$SELF, Tenure, and how participation tokens work',
    icon: '🪙',
    sort_order: 14,
  },
];

// file → { category (global category name), title, description }
const MANIFEST = [
  {
    file: '20-open-source.md',
    category: 'Getting Started',
    title: 'Open Source: Join SpiritDAO or Run Your Own',
    description: 'What the open-source release means, when running your own copy makes sense, and why most communities should join instead.',
  },
  {
    file: '01-getting-started.md',
    category: 'Getting Started',
    title: 'Getting Started Guide',
    description: 'Written walkthrough of joining SpiritDAO: wallet, profile, tokens, and finding your way around.',
  },
  {
    file: '09-app-walkthrough.md',
    category: 'Getting Started',
    title: 'App Walkthrough (Written Guide)',
    description: 'A tour of every section of the app and what it is for.',
  },
  {
    file: '02-pod-management.md',
    category: 'Pods',
    title: 'Pod Management Guide',
    description: 'Creating pods, roles and permissions, modules, treasury, and day-to-day pod leadership.',
  },
  {
    file: '03-governance-voting.md',
    category: 'Governance',
    title: 'Governance & Voting Guide',
    description: 'How proposals work, the governance tiers, creating proposals, and voting.',
  },
  {
    file: '04-bounties-system.md',
    category: 'Bounties',
    title: 'Bounties Guide',
    description: 'The full bounty lifecycle in writing: creating, applying, submitting work, review, and payout.',
  },
  {
    file: '05-events-calendar.md',
    category: 'Events',
    title: 'Events & Calendar Guide',
    description: 'Creating events, registration and tickets, attendance credentials, and the calendar.',
  },
  {
    file: '06-forum-discussions.md',
    category: 'Forums',
    title: 'Forum Guide',
    description: 'Categories, threads, moderation, and how forum discussion feeds governance.',
  },
  {
    file: '07-marketplace-shopping.md',
    category: 'Marketplace',
    title: 'Marketplace Guide',
    description: 'Browsing, buying, and how payments work in the marketplace.',
  },
  {
    file: '08-video-chat-conferencing.md',
    category: 'Identity',
    title: 'Video Chat & Conferencing Guide',
    description: 'Starting and joining video calls and conference rooms.',
  },
  {
    file: '10-linking-external-wallets.md',
    category: 'Identity',
    title: 'Linking External Wallets',
    description: 'Count tokens in your personal wallet (MetaMask etc.) toward community governance — sign one free message, tokens never move.',
  },
  {
    file: '11-surveys.md',
    category: 'Pods',
    title: 'Surveys Guide',
    description: 'Taking pod surveys, and creating them as a leader: question types, activation, and reading results.',
  },
  {
    file: '12-password-vault.md',
    category: 'Pods',
    title: 'Password Vault Guide',
    description: 'End-to-end encrypted shared credentials for your pod: setup, using entries, granting access, and the honest security model.',
  },
  {
    file: '13-community-agent.md',
    category: 'Pods',
    title: 'Community Agent (Pod AI) Guide',
    description: 'Your pod’s optional AI member: daily discussions, @mention replies, event drafts, and how leaders configure and subscribe.',
  },
  {
    file: '14-chat-and-messages.md',
    category: 'Chat',
    title: 'Chat & Direct Messages Guide',
    description: 'Pod chat rooms, direct messages, mentions, moderation, and blocking.',
  },
  {
    file: '15-self-token-and-tenure.md',
    category: 'Tokens',
    title: '$SELF & Tenure Guide',
    description: 'How $SELF is earned, why it fades, burn-to-pay, and the five permanent Tenure bands.',
  },
  {
    file: '16-pod-agreements.md',
    category: 'Pods',
    title: 'Pod Agreements Guide',
    description: 'Signing accountability agreements, what unsigned agreements block, and how leaders attach them to roles.',
  },
  {
    file: '17-inviting-people.md',
    category: 'Getting Started',
    title: 'Inviting People to SpiritDAO',
    description: 'Email invitations, pod invite links (leaders), and referral codes — how to bring people into the ecosystem.',
  },
  {
    file: '18-pod-faces.md',
    category: 'Pods',
    title: 'Pod Faces (Custom Appearance) Guide',
    description: 'Pods design a custom look — colors and icon sets — and members choose whether to wear it. Designing, publishing, and switching faces.',
  },
  {
    file: '19-journal-and-places.md',
    category: 'Pods',
    title: 'Journal and Places Guide',
    description: 'Journal mode for forum categories, the members-only Places map (assets, partners, sites, proposed ideas) with the Places Manage permission, and the optional Identity location opt-in.',
  },
];

// ── minimal markdown → HTML (headings, lists, bold/italic/code, links,
//    fenced code, blockquote, hr, tables not needed, external images only) ──
function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(`<code>${esc(c)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  // images: keep only absolute http(s) sources; drop relative ones (won't resolve in KB)
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) =>
    /^https?:\/\//i.test(src.trim())
      ? `<img src="${src.trim()}" alt="${alt}" style="max-width:100%">`
      : '',
  );
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, u) => {
    const href = u.trim();
    const target = /^https?:\/\//i.test(href) ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${href}"${target}>${t}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
  return s;
}
function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const fence = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) fence.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(fence.join('\n'))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      out.push(`<h${h[1].length}>${inline(h[2].trim())}</h${h[1].length}>`);
      i++;
      continue;
    }
    if (/^---+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(line)) {
      const bq = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) bq.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote><p>${inline(bq.join(' '))}</p></blockquote>`);
      continue;
    }
    const listStart = (l) => /^(\s*)([-*]|\d+\.)\s+/.test(l);
    if (listStart(line)) {
      const items = [];
      while (i < lines.length && (listStart(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        if (listStart(lines[i])) items.push(lines[i]);
        else items[items.length - 1] += ' ' + lines[i].trim(); // continuation line
        i++;
      }
      const ordered = /^\s*\d+\./.test(items[0]);
      const tag = ordered ? 'ol' : 'ul';
      // one nesting level: items indented 2+ spaces fold under the previous item
      let html = `<${tag}>`;
      let subOpen = null;
      for (const it of items) {
        const m = it.match(/^(\s*)(?:[-*]|\d+\.)\s+(.*)$/);
        const indented = m[1].length >= 2;
        if (indented) {
          const subTag = /^\s*\d+\./.test(it) ? 'ol' : 'ul';
          if (!subOpen) { html += `<${subTag}>`; subOpen = subTag; }
          html += `<li>${inline(m[2])}</li>`;
        } else {
          if (subOpen) { html += `</${subOpen}></li>`; subOpen = null; }
          else if (html !== `<${tag}>`) html += '</li>';
          html += `<li>${inline(m[2])}`;
        }
      }
      if (subOpen) html += `</${subOpen}>`;
      html += `</li></${tag}>`;
      out.push(html);
      continue;
    }
    if (line.trim() === '') { i++; continue; }
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,4}\s|```|---+\s*$|>\s?)/.test(lines[i]) &&
      !/^(\s*)([-*]|\d+\.)\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

// ── mirror ──────────────────────────────────────────────────────────
for (const cat of ENSURE_CATEGORIES) {
  const { data: existing } = await supabase
    .from('knowledge_categories')
    .select('id')
    .is('pod_id', null)
    .eq('name', cat.name)
    .maybeSingle();
  if (!existing) {
    const { error } = await supabase.from('knowledge_categories').insert({
      pod_id: null,
      ...cat,
      is_public: true,
      created_by: 'system',
    });
    if (error) throw error;
    console.log(`Created global category: ${cat.name}`);
  }
}

const { data: cats, error: catErr } = await supabase
  .from('knowledge_categories')
  .select('id, name')
  .is('pod_id', null);
if (catErr) throw catErr;
const catByName = Object.fromEntries(cats.map((c) => [c.name, c.id]));

let inserted = 0;
let updated = 0;
for (const entry of MANIFEST) {
  const catId = catByName[entry.category];
  if (!catId) {
    console.warn(`SKIP ${entry.file}: no global category "${entry.category}"`);
    continue;
  }
  const md = fs.readFileSync(path.join(GUIDES_DIR, entry.file), 'utf-8');
  const html = mdToHtml(md);

  const { data: existing } = await supabase
    .from('knowledge_items')
    .select('id')
    .eq('category_id', catId)
    .is('pod_id', null)
    .eq('title', entry.title)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('knowledge_items')
      .update({
        description: entry.description,
        content_text: html,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) throw error;
    updated++;
    console.log(`UPDATED  [${entry.category}] ${entry.title}`);
  } else {
    const { error } = await supabase.from('knowledge_items').insert({
      category_id: catId,
      pod_id: null,
      title: entry.title,
      description: entry.description,
      content_type: 'markdown',
      content_text: html,
      is_public: true,
      view_count: 0,
      sort_order: 100 + MANIFEST.indexOf(entry), // written guides after videos
      created_by: 'system',
    });
    if (error) throw error;
    inserted++;
    console.log(`INSERTED [${entry.category}] ${entry.title}`);
  }
}
console.log(`\nDone: ${inserted} inserted, ${updated} updated.`);
