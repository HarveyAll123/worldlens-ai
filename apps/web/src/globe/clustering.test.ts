import { describe, expect, it } from 'vitest';
import { clusterScreenPoints, pickLabels } from './clustering';

describe('screen-space clustering', () => {
  it('groups nearby points and keeps distant ones apart', () => {
    const c = clusterScreenPoints(
      [
        { id: 'a', x: 10, y: 10, weight: 1 },
        { id: 'b', x: 20, y: 15, weight: 5 },
        { id: 'c', x: 300, y: 300, weight: 1 },
      ],
      60,
    );
    expect(c).toHaveLength(2);
    const big = c.find((x) => x.ids.length === 2)!;
    expect(big.representativeId).toBe('b');
    expect(big.x).toBe(15);
  });
  it('clusters more aggressively with larger cells (LOW tier)', () => {
    const pts = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      x: (i % 10) * 30,
      y: Math.floor(i / 10) * 30,
      weight: i,
    }));
    expect(clusterScreenPoints(pts, 84).length).toBeLessThan(clusterScreenPoints(pts, 46).length);
  });
  it('labels the most important items within budget', () => {
    expect(
      [
        ...pickLabels(
          [
            { id: 'x', weight: 1 },
            { id: 'y', weight: 9 },
            { id: 'z', weight: 5 },
          ],
          2,
        ),
      ].sort(),
    ).toEqual(['y', 'z']);
    expect(pickLabels([{ id: 'x', weight: 1 }], 0).size).toBe(0);
  });
});
