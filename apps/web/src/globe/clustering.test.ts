import { describe, expect, it } from 'vitest';
import {
  atOnePlace,
  cellDegForLevel,
  clearOfMarkers,
  clusterGeo,
  clusterLevel,
  placeLabels,
} from './clustering';

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

describe('events at one place', () => {
  it('recognises events pinned to the same spot (within ~1 km)', () => {
    const berlin = { lat: 52.52, lon: 13.405 };
    expect(atOnePlace([berlin, berlin, berlin])).toBe(true);
    expect(atOnePlace([berlin, { lat: 52.525, lon: 13.41 }])).toBe(true); // ~650 m
    expect(atOnePlace([berlin, { lat: 52.6, lon: 13.405 }])).toBe(false); // ~9 km
    expect(atOnePlace([berlin])).toBe(false); // one event is not a choice
  });

  it('a title may sit beside its own marker, never across another event’s or a cluster’s', () => {
    const marker = (id: string, x: number, y: number, size = 14) => ({
      id,
      x: x - size / 2,
      y: y - size / 2,
      width: size,
      height: size,
    });
    const markers = [marker('saint-malo', 100, 100), marker('cluster-of-10', 150, 96, 34)];
    // "Battle of Saint-Malo" to the right of its marker runs under the cluster's count…
    const right = { x: 110, y: 89, width: 150, height: 22 };
    expect(clearOfMarkers(right, 'saint-malo', markers)).toBe(false);
    // …so it goes to the left, where only its own marker is near.
    const left = { x: -60, y: 89, width: 150, height: 22 };
    expect(clearOfMarkers(left, 'saint-malo', markers)).toBe(true);
    expect(clearOfMarkers(right, 'saint-malo', [marker('saint-malo', 100, 100)])).toBe(true);
  });
});
