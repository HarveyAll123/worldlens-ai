import { describe, expect, it } from 'vitest';
import { cellDegForLevel, clusterGeo, clusterLevel, placeLabels } from './clustering';

describe('map-anchored clustering', () => {
  it('groups points in the same map cell and keeps distant ones apart', () => {
    const level = clusterLevel(1, null); // ~1° cells
    const c = clusterGeo(
      [
        { id: 'a', lat: 50.1, lon: 4.1, weight: 1 },
        { id: 'b', lat: 50.2, lon: 4.2, weight: 5 },
        { id: 'c', lat: 10, lon: 100, weight: 1 },
      ],
      level,
    );
    expect(c).toHaveLength(2);
    const big = c.find((x) => x.ids.length === 2)!;
    expect(big.representativeId).toBe('b');
  });

  it('gives the same clusters wherever the camera is (panning never regroups)', () => {
    const pts = Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      lat: (i * 7.3) % 80,
      lon: ((i * 13.7) % 340) - 170,
      weight: i % 5,
    }));
    const level = clusterLevel(2, null);
    const a = clusterGeo(pts, level).map((c) => `${c.key}=${c.ids.join(',')}`);
    const b = clusterGeo([...pts].reverse(), level).map((c) => `${c.key}=${c.ids.join(',')}`);
    expect(a.sort()).toEqual(b.sort());
  });

  it('changes level only well past a threshold (no flicker at a boundary)', () => {
    const level = clusterLevel(cellDegForLevel(5), null);
    expect(level).toBe(5);
    expect(clusterLevel(cellDegForLevel(5) * 1.3, level)).toBe(5);
    expect(clusterLevel(cellDegForLevel(5) / 1.3, level)).toBe(5);
    expect(clusterLevel(cellDegForLevel(6), level)).toBe(6);
  });

  it('places the most important labels first and never overlaps them', () => {
    const chosen = placeLabels(
      [
        { id: 'low', x: 0, y: 0, width: 100, height: 20, weight: 1 },
        { id: 'high', x: 50, y: 5, width: 100, height: 20, weight: 9 },
        { id: 'apart', x: 0, y: 100, width: 100, height: 20, weight: 2 },
      ],
      5,
    );
    expect([...chosen].sort()).toEqual(['apart', 'high']);
    expect(placeLabels([{ id: 'x', x: 0, y: 0, width: 1, height: 1, weight: 1 }], 0).size).toBe(0);
  });
});
