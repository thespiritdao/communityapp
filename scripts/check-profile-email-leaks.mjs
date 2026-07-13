#!/usr/bin/env node
/**
 * check-profile-email-leaks.mjs
 *
 * Guard against re-leaking member email to other members' browsers.
 *
 * Member email is PRIVATE: it must never be pulled into a peer's client. Client
 * code must select explicit public columns from `user_profiles` (never `*`, and
 * never `email`) except when reading the CURRENT user's OWN row, or on the
 * server via the service-role key.
 *
 * This script flags client-side `.from('user_profiles').select('*')` and any
 * client select that includes `email`, so a future careless query doesn't
 * silently re-open the leak. Run in CI or before deploy:
 *
 *   node scripts/check-profile-email-leaks.mjs
 *
 * It is intentionally conservative: it reports, it does not auto-fix. Review each
 * hit — if it is an own-row read (.eq('user_id', <self>)) or a server/service-role
 * file, add it to ALLOWLIST below with a reason.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'src');

// Files that legitimately read email (own-row reads, or server/service-role).
// Keep this list short and justified.
const ALLOWLIST = [
  'lib/emailDigest.ts', // server-side, service-role
  'lib/donationEmail.ts', // server-side, service-role
  'lib/donationReceipt.ts', // server-side, service-role
  'app/page.tsx', // auth/onboarding own-flow email lookup
  'components/DebugAuth.tsx', // own row only (debug)
  'features/identity/components/ProfileEditForm.tsx', // user editing own email
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'venv') continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const findings = [];
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file).replace(/\\/g, '/');
  if (ALLOWLIST.some((a) => rel.endsWith(a))) continue;

  // Only client-executed code can leak email to a PEER's browser. Skip
  // server-side surfaces: API routes (src/app/api/**) and route.ts handlers
  // run on the server (often with the service-role key) and are out of scope
  // for the peer-exposure guard. The eventual DB-level boundary (a
  // public_profiles view) is what will cover server queries too.
  if (rel.startsWith('app/api/') || /(^|\/)route\.ts$/.test(rel)) continue;

  const text = readFileSync(file, 'utf8');
  if (!text.includes("from('user_profiles')")) continue;

  const lines = text.split('\n');
  lines.forEach((line, i) => {
    // Flag select('*') that likely targets user_profiles (same file uses it).
    if (/\.select\(\s*['"]\*['"]\s*\)/.test(line)) {
      findings.push(`${rel}:${i + 1}  select('*') near user_profiles`);
    }
    // Flag any select list that includes the email column.
    if (/\.select\([^)]*\bemail\b[^)]*\)/.test(line)) {
      findings.push(`${rel}:${i + 1}  select includes 'email'`);
    }
  });
}

if (findings.length) {
  console.warn('\n⚠️  Potential member-email exposure in client queries:\n');
  findings.forEach((f) => console.warn('  ' + f));
  console.warn(
    `\n${findings.length} client user_profiles queries select '*' or 'email'.\n` +
      'Member email is private. These pull email into the browser (even if not\n' +
      'displayed). The definitive fix is a `public_profiles` DB view without the\n' +
      'email column, which closes all of these at once — see\n' +
      'docs/spec-member-email-privacy.md. This check is ADVISORY (exit 0) until\n' +
      'that view lands; the highest-exposure surfaces (members directory, DM/chat\n' +
      'peer lists) are already fixed to omit email.\n',
  );
  // Advisory only — do not fail the build. Flip to process.exit(1) once the
  // public_profiles view is in place and the remaining call sites are migrated.
  process.exit(0);
}
console.log('✓ No member-email leaks found in client user_profiles queries.');
