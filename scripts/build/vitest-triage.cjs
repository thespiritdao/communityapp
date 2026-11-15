// scripts/build/vitest-triage.cjs — summarise a vitest JSON report.
//   npx vitest run --reporter=json --outputFile=/tmp/vitest.json
//   node scripts/build/vitest-triage.cjs /tmp/vitest.json [regex-of-areas-of-interest]
const [, , file, areasArg] = process.argv;
const j = require(require('path').resolve(file || '/tmp/vitest.json'));
const norm = (p) => String(p).split('\\').join('/').replace(/.*commapp\//, '');
const failed = j.testResults.filter((t) => t.status === 'failed');
console.log(`failed files: ${failed.length} of ${j.testResults.length}`);
if (areasArg) {
  const areas = new RegExp(areasArg, 'i');
  const touch = failed.map((t) => norm(t.name)).filter((f) => areas.test(f));
  console.log(`failing files in areas of interest: ${touch.length}`);
  touch.forEach((f) => console.log('   ', f));
}
const dirs = {};
failed.forEach((t) => { const d = norm(t.name).split('/').slice(0, 3).join('/'); dirs[d] = (dirs[d] || 0) + 1; });
console.log('failures by area:');
Object.entries(dirs).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([d, n]) => console.log('  ' + String(n).padStart(3), d));
const msgs = {};
failed.forEach((t) => {
  const a = (t.assertionResults || []).find((x) => x.status === 'failed');
  const first = (t.message || (a && a.failureMessages && a.failureMessages[0]) || '').split('\n')[0].slice(0, 100);
  msgs[first] = (msgs[first] || 0) + 1;
});
console.log('top failure messages:');
Object.entries(msgs).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([m, n]) => console.log('  ' + String(n).padStart(3), m || '(no message captured)'));
