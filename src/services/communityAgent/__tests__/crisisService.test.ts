// Crisis protocol patterns (Congregant Phase 7): genuine distress must be
// flagged; everyday figures of speech about death must not be.
import { describe, expect, it, vi } from 'vitest';

// The service also notifies pod leaders; those clients are not under test.
vi.mock('@/utils/supabaseAdminClient', () => ({ supabaseAdmin: {} }));
vi.mock('@/lib/serverNotifications', () => ({ sendServerNotificationBatch: vi.fn() }));

import { crisisResponse, detectCrisis } from '../crisisService';

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

describe('detectCrisis', () => {
  it.each(positive)('flags: %s', (text) => {
    expect(detectCrisis(text)).toBe(true);
  });
  it.each(negative)('does not flag: %s', (text) => {
    expect(detectCrisis(text)).toBe(false);
  });
  it('handles empty input', () => {
    expect(detectCrisis('')).toBe(false);
    expect(detectCrisis(null)).toBe(false);
    expect(detectCrisis(undefined)).toBe(false);
  });
});

describe('crisisResponse', () => {
  it('names the agent and is non-empty', () => {
    const r = crisisResponse('Kairos');
    expect(r.length).toBeGreaterThan(50);
    expect(r).toContain('Kairos');
  });
});
