#!/usr/bin/env node
// Copy the versioned hooks in scripts/hooks into .git/hooks.
//
// Git hooks live outside the repository, so they cannot be versioned directly
// and do not arrive with a clone. Run `npm run hooks:install` once per
// checkout.

import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, '..', 'hooks');
const target = path.join(here, '..', '..', '.git', 'hooks');

if (!existsSync(target)) {
  // A worktree or a bare checkout keeps hooks elsewhere; say so rather than
  // silently succeeding.
  console.error(`No .git/hooks directory at ${target}. Nothing installed.`);
  process.exit(1);
}
mkdirSync(source, { recursive: true });

let n = 0;
for (const name of readdirSync(source)) {
  const dest = path.join(target, name);
  copyFileSync(path.join(source, name), dest);
  try {
    chmodSync(dest, 0o755);
  } catch {
    // Windows ignores the mode; Git for Windows runs the hook regardless.
  }
  console.log(`installed ${name}`);
  n += 1;
}
console.log(`${n} hook${n === 1 ? '' : 's'} installed into .git/hooks`);
