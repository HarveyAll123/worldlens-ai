import { describe, expect, it } from 'vitest';
import { MAX_EVENTS_PER_REQUEST } from '@worldlens/shared';
import { TIER_SETTINGS, TIERS } from './tiers';

describe('quality tiers', () => {
  it('never ask the API for more events than it serves', () => {
    // A tier above the API's limit got a 400 for every events request ("could not be loaded").
    for (const tier of TIERS)
      expect(TIER_SETTINGS[tier].maxEvents).toBeLessThanOrEqual(MAX_EVENTS_PER_REQUEST);
  });
});
