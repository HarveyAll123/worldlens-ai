import { describe, expect, it } from 'vitest';
import { edgePush, edgeShift, trackUnit, viewAfter } from './timelineDrag';

describe('timeline edge scrolling', () => {
  it('pushes only near or past the ends of the track', () => {
    expect(edgePush(500, 0, 1000)).toBe(0);
    expect(edgePush(990, 0, 1000)).toBeGreaterThan(0);
    expect(edgePush(10, 0, 1000)).toBeLessThan(0);
    expect(edgePush(5000, 0, 1000)).toBe(1.4);
    expect(edgePush(-5000, 0, 1000)).toBe(-1.4);
  });
  it('creeps at the edge and is capped when pushed hard', () => {
    const window = 12 * 365.25 * 86_400_000; // 12-year window (Year view)
    const yearsPerSecond = (push: number) => edgeShift(push, window, 1) / (365.25 * 86_400_000);
    expect(yearsPerSecond(0.2)).toBeLessThan(0.2);
    expect(yearsPerSecond(1.4)).toBeCloseTo(8.2, 1);
    expect(yearsPerSecond(-1.4)).toBeCloseTo(-8.2, 1);
  });
});

describe('timeline overview', () => {
  it('moves in years on the 1800–now overview, whatever the selected resolution', () => {
    expect(trackUnit('century', 'day')).toBe('year'); // LIVE: overview with day resolution
    expect(trackUnit('century', 'year')).toBe('year');
    expect(trackUnit('year', 'year')).toBe('year');
    expect(trackUnit('month', 'month')).toBe('month');
    expect(trackUnit('day', 'day')).toBe('day');
  });

  it('keeps the overview when a year is picked on it', () => {
    expect(viewAfter('century', 'year')).toBe('century');
  });

  it('follows other resolution changes (buttons, search, AI)', () => {
    expect(viewAfter('century', 'day')).toBe('day');
    expect(viewAfter('century', 'month')).toBe('month');
    expect(viewAfter('year', 'year')).toBe('year');
    expect(viewAfter('day', 'year')).toBe('year');
    // The D button in LIVE used to land back on the overview.
    expect(viewAfter('hour', 'day')).toBe('day');
    expect(viewAfter('month', 'day')).toBe('day');
  });
});
