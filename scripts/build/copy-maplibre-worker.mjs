// Copies MapLibre v6's worker (and the shared chunk it imports) into
// public/maplibre so the Places map can load it same-origin. Next's bundler
// does not emit these files itself; see the "Turbopack" setup in MapLibre's
// installation docs. Runs as prebuild/predev; PlacesMap calls
// setWorkerUrl('/maplibre/maplibre-gl-worker.mjs').

import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const dist = path.join(path.dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json')), 'dist');
const dest = path.join(process.cwd(), 'public', 'maplibre');

mkdirSync(dest, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(path.join(dist, file), path.join(dest, file));
}
console.log('copy-maplibre-worker: copied worker files to public/maplibre');
