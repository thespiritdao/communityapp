// scripts/test-crisis-detection.ts
// Unit check for the crisis protocol patterns (Congregant Phase 7).
// Run: npx tsx scripts/test-crisis-detection.ts
import { detectCrisis, crisisResponse } from '../src/services/communityAgent/crisisService';

const positive = [
  'I have been thinking about killing myself lately',
  'honestly i just want to die',
  'whats the point, everyone would be better off without me',
  'I keep hurting myself and I cant stop',
  'im done. ending my life would be easier',
];
const negative = [
  'this bounty deadline is killing me lol',
  'my phone battery died',
  'the old forum thread is dead',
  'I could just die of embarrassment haha',
  'what does Kairos think about mortality and the fear of death?',
  'the harvest ritual marks the death of the season',
];

let failures = 0;
for (const t of positive) {
  const ok = detectCrisis(t);
  if (!ok) failures++;
  console.log(ok ? '✅ flagged  :' : '❌ MISSED   :', t.slice(0, 55));
}
for (const t of negative) {
  const ok = !detectCrisis(t);
  if (!ok) failures++;
  console.log(ok ? '✅ passed   :' : '❌ FALSE POS:', t.slice(0, 55));
}
console.log('---');
console.log('response excerpt:', crisisResponse('Kairos').split('\n')[4]);
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
