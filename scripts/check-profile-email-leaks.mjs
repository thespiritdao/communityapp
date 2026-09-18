#!/usr/bin/env node
/**
 * check-profile-email-leaks.mjs
 *
 * Guard against re-leaking member private data to other members' browsers.
 *
 * Member email, phone, address and date of birth are PRIVATE: they must never
 * be pulled into a peer's client. Client code reads OTHER members through the
 * `public_profiles` view (which has no private columns). The base table
 * `user_profiles` is for the CURRENT user's OWN row, for writes, and for
 * server code using the service-role key.
 *
 * This script flags, in client-side code:
 *   - `.from('user_profiles')` followed by `.select('*')` that is not an
 *     own-row read (no `.eq('user_id', …)` in the next few lines)
 *   - any `.from('user_profiles')` select whose column list names email, phone,
 *     date_of_birth, or an address column, unless the read is own-row
 *
 * Run in CI or before deploy:
 *
 *   node scripts/check-profile-email-leaks.mjs
 *
 * Exit code 1 on any finding. If a hit is a legitimate own-row read that the
 * heuristic cannot see, or a server/service-role file, add it to ALLOWLIST
 * below with a reason.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src');

// Files that legitimately read private columns (own-row reads, or server/service-role).
// Keep this list short and justified.
const ALLOWLIST = [
  'lib/emailDigest.ts', // server-side, service-role
  'lib/donationEmail.ts', // server-side, service-role
  'lib/donationReceipt.ts', // server-side, service-role
  'app/page.tsx', // auth/onboarding own-flow email lookup
  'components/DebugAuth.tsx', // own row only (debug)
  'features/identity/components/ProfileEditForm.tsx', // user editing own email
  'features/identity/services/ProfileService.ts', // getOwnByWallet: own row, base table
  'app/marketplace/orders/[id]/page.tsx', // seller reads buyer shipping address (no email)
];

const PRIVATE_COLUMNS = /\b(email|phone|date_of_birth|address_1|address_2|city|state|zip)\b/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'venv') continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

const findings = [];
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file).replace(/\\/g, '/');
  if (ALLOWLIST.some((a) => rel.endsWith(a))) continue;

  // Only client-executed code can leak to a PEER's browser. API routes run on
  // the server; the public_profiles view and RLS are the boundary there.
  if (rel.startsWith('app/api/') || /(^|\/)route\.ts$/.test(rel)) continue;

  const text = readFileSync(file, 'utf8');
  if (!/from\(['"]user_profiles['"]\)/.test(text)) continue;

  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (!/\.from\(['"]user_profiles['"]\)/.test(line)) return;
    // The query chain that follows the from(): a small window is enough.
    const chain = lines.slice(i, i + 8).join('\n');
    // Writes (insert/update/upsert) return only the caller's own row under
    // RLS, so a trailing .select('*') there is not a peer read.
    if (/\.(insert|update|upsert)\(/.test(chain)) return;
    const selectMatch = chain.match(/\.select\(\s*([\s\S]*?)\)/);
    if (!selectMatch) return;
    const selectArg = selectMatch[1];
    const ownRow = /\.eq\(\s*['"]user_id['"]\s*,/.test(chain);
    if (ownRow) return;
    if (/^['"]\*['"]$/.test(selectArg.trim())) {
      findings.push(`${rel}:${i + 1}  select('*') on user_profiles for a peer row — use public_profiles`);
    } else if (PRIVATE_COLUMNS.test(selectArg)) {
      findings.push(`${rel}:${i + 1}  selects a private column from user_profiles for a peer row`);
    }
  });
}

if (findings.length) {
  console.error('\n✖ Member private data exposed to peer browsers:\n');
  findings.forEach((f) => console.error('  ' + f));
  console.error(
    `\n${findings.length} client user_profiles read(s) pull private columns for other members.\n` +
      "Read other members through .from('public_profiles') instead; keep the base\n" +
      'table for the current user\'s own row and for writes. See\n' +
      'docs/spec-member-email-privacy.md.\n',
  );
  process.exit(1);
}
console.log('✓ No member private-data leaks found in client user_profiles queries.');
