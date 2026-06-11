import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const swPath = join(process.cwd(), 'public', 'sw.js');
  let swContent = readFileSync(swPath, 'utf-8');

  // Inject the deploy commit SHA so cache busts automatically on every deploy.
  // Fallback MUST be stable across requests: a per-request value (Date.now())
  // makes the browser see a "new" service worker on every check, which chains
  // skipWaiting -> clients.claim -> controllerchange -> PWAManager reload in
  // an infinite loop wherever the SHA is unset (always in local dev).
  const version = process.env.VERCEL_GIT_COMMIT_SHA
    ? process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8)
    : createHash('sha256').update(swContent).digest('hex').slice(0, 8);

  swContent = swContent.replace(
    /const CACHE_VERSION = '[^']*';/,
    `const CACHE_VERSION = '${version}';`
  );

  return new NextResponse(swContent, {
    headers: {
      'Content-Type': 'application/javascript',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-store',
    },
  });
}
