#!/usr/bin/env node
// scripts/build/docs-screenshots.mjs — documentation screenshots pipeline.
//
//   node scripts/build/docs-screenshots.mjs scaffold   # create public/images/docs/<slug>/ folders (+ .gitkeep)
//   node scripts/build/docs-screenshots.mjs plan       # write public/images/docs/SHOTLIST.md from manifest.json
//   node scripts/build/docs-screenshots.mjs status     # which shots exist / are missing, by priority
//   node scripts/build/docs-screenshots.mjs insert     # insert existing shots into src/guides/user/*.md (idempotent)
//   node scripts/build/docs-screenshots.mjs insert --dry
//
// Source of truth: public/images/docs/manifest.json. Images are referenced by
// absolute URL (baseUrl) so they render on the website (build-docs.mjs), in the
// in-app Knowledge Base (kb-mirror-guides.mjs, external images only) and are
// ignored harmlessly by the Sensemaker embed.
//
// After `insert`: node ../../website/functions/build-docs.mjs, then
// node scripts/db/kb-mirror-guides.mjs, commit, deploy app + website.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const IMG_DIR = path.join(ROOT, 'public', 'images', 'docs');
const GUIDES_DIR = path.join(ROOT, 'src', 'guides', 'user');
const MANIFEST = path.join(IMG_DIR, 'manifest.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const cmd = process.argv[2] || 'status';
const dry = process.argv.includes('--dry');

const imgUrl = (s) => `${manifest.baseUrl}/${s.slug}/${s.file}`;
const imgPath = (s) => path.join(IMG_DIR, s.slug, s.file);
const exists = (s) => fs.existsSync(imgPath(s));
const mdLine = (s) => `![${s.caption.replace(/[\[\]]/g, '')}](${imgUrl(s)})`;

function scaffold() {
  for (const slug of Object.keys(manifest.guides)) {
    const dir = path.join(IMG_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });
    const keep = path.join(dir, '.gitkeep');
    if (!fs.existsSync(keep)) fs.writeFileSync(keep, '');
  }
  console.log(`✓ ${Object.keys(manifest.guides).length} folders under public/images/docs/`);
}

function plan() {
  const byGuide = new Map();
  for (const s of manifest.shots) {
    if (!byGuide.has(s.slug)) byGuide.set(s.slug, []);
    byGuide.get(s.slug).push(s);
  }
  const P = { 1: 'P1 — must have', 2: 'P2 — should have', 3: 'P3 — nice to have' };
  const total = manifest.shots.length;
  const counts = [1, 2, 3].map((p) => manifest.shots.filter((s) => s.priority === p).length);
  let out = `# Documentation screenshot shot list\n\n`;
  out += `*Generated from \`public/images/docs/manifest.json\` by \`scripts/build/docs-screenshots.mjs plan\`. Edit the manifest, not this file.*\n\n`;
  out += `**${total} shots** — ${counts[0]} P1, ${counts[1]} P2, ${counts[2]} P3. Do P1 first across all guides; the docs are useful with P1 alone.\n\n`;
  out += `## Capture standard\n\n`;
  for (const [k, v] of Object.entries(manifest.standard)) out += `- **${k}**: ${v}\n`;
  out += `\nSave each file into \`public/images/docs/<folder>/\` with the exact name shown. "Reuse" points at an existing capture that may already match; open it, compare to the live screen, and copy it into place if it is current.\n\n`;
  out += `Placement: *before-body* = the image goes directly under the heading; *after-body* = at the end of that section, just before the next heading.\n\n`;
  for (const [slug, shots] of byGuide) {
    const g = manifest.guides[slug];
    out += `---\n\n## ${g.title}  \`${g.file}\` → folder \`${slug}/\`\n\n`;
    for (const s of shots) {
      const st = exists(s) ? '✅' : '⬜';
      out += `### ${st} \`${s.file}\` — ${P[s.priority]}\n\n`;
      out += `- **Where in the doc:** ${s.placement} of \`${s.heading}\`\n`;
      out += `- **Caption:** ${s.caption}\n`;
      out += `- **Screen:** \`${s.capture.url}\` as *${s.capture.actor}*\n`;
      out += `- **What to show:** ${s.capture.state}\n`;
      out += `- **Crop:** ${s.capture.crop}\n`;
      if (s.capture.reuse) out += `- **Reuse:** ${s.capture.reuse}\n`;
      out += `\n`;
    }
  }
  fs.writeFileSync(path.join(IMG_DIR, 'SHOTLIST.md'), out);
  console.log(`✓ SHOTLIST.md written (${total} shots)`);
}

function status() {
  let have = 0;
  for (const p of [1, 2, 3]) {
    const rows = manifest.shots.filter((s) => s.priority === p);
    const done = rows.filter(exists).length;
    have += done;
    console.log(`P${p}: ${done}/${rows.length}`);
    for (const s of rows) console.log(`  ${exists(s) ? '✅' : '⬜'} ${s.slug}/${s.file}`);
  }
  console.log(`\n${have}/${manifest.shots.length} present`);
  // orphan files not in manifest
  for (const slug of Object.keys(manifest.guides)) {
    const dir = path.join(IMG_DIR, slug);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f === '.gitkeep') continue;
      if (!manifest.shots.some((s) => s.slug === slug && s.file === f)) console.log(`⚠ not in manifest: ${slug}/${f}`);
    }
  }
}

function insert() {
  const byFile = new Map();
  for (const s of manifest.shots) {
    if (!exists(s)) continue;
    const g = manifest.guides[s.slug];
    if (!byFile.has(g.file)) byFile.set(g.file, []);
    byFile.get(g.file).push(s);
  }
  let inserted = 0, skipped = 0, missing = 0;
  for (const [file, shots] of byFile) {
    const p = path.join(GUIDES_DIR, file);
    let text = fs.readFileSync(p, 'utf8');
    const nl = text.includes('\r\n') ? '\r\n' : '\n';
    let lines = text.split(/\r?\n/);
    for (const s of shots) {
      const line = mdLine(s);
      if (text.includes(imgUrl(s))) { skipped++; continue; }
      const hIdx = lines.findIndex((l) => l.trim() === s.heading.trim());
      if (hIdx === -1) { console.warn(`⚠ heading not found in ${file}: ${s.heading}`); missing++; continue; }
      let at;
      if (s.placement === 'before-body') {
        at = hIdx + 1;
        lines.splice(at, 0, '', line);
      } else {
        // end of section: next heading of any level, or EOF; back up over trailing blanks
        let next = lines.findIndex((l, i) => i > hIdx && /^#{1,6}\s/.test(l));
        if (next === -1) next = lines.length;
        let end = next;
        while (end > hIdx + 1 && lines[end - 1].trim() === '') end--;
        lines.splice(end, 0, '', line);
      }
      text = lines.join(nl);
      inserted++;
      console.log(`+ ${file}: ${s.file} (${s.placement} ${s.heading})`);
    }
    if (!dry) fs.writeFileSync(p, lines.join(nl));
  }
  console.log(`\n${dry ? '[dry run] ' : ''}inserted ${inserted}, already present ${skipped}, headings not found ${missing}`);
  if (!dry && inserted) console.log('Next: node ../../website/functions/build-docs.mjs && node scripts/db/kb-mirror-guides.mjs');
}

const commands = { scaffold, plan, status, insert };
if (commands[cmd]) commands[cmd]();
else console.error(`unknown command ${cmd} (expected scaffold | plan | status | insert)`);
