import { describe, expect, it } from 'vitest';
import type { PlaceName } from '@worldlens/shared';
import { markDraw, marksView, markShapeIds } from './placeMarks';

const names: PlaceName[] = [
  { id: 'r1', name: 'Yangtze', lat: 30, lon: 108, minZoom: 3, kind: 'r' },
  { id: 'r1.1', name: 'Yangtze', lat: 31, lon: 117, minZoom: 4, kind: 'r' },
  { id: 'r2', name: 'Yangtze', lat: 27, lon: 101, minZoom: 3, kind: 'r' },
  { id: 'r9', name: 'Red River', lat: 33, lon: -97, minZoom: 4, kind: 'r' },
  { id: 'r8', name: 'Red River', lat: 21, lon: 105, minZoom: 4, kind: 'r' },
  {
    id: 'o1',
    name: 'North Pacific Ocean',
    lat: 20,
    lon: -135,
    minZoom: 1,
    kind: 'o',
    alt: 'Pacific Ocean',
  },
  {
    id: 'o2',
    name: 'South Pacific Ocean',
    lat: -30,
    lon: -106,
    minZoom: 1,
    kind: 'o',
    alt: 'Pacific Ocean',
  },
  { id: 'C1', name: 'Paris', lat: 48.87, lon: 2.33, minZoom: 1.7, kind: 'C' },
];
const mark = (id: string) => {
  const n = names.find((x) => x.id === id)!;
  return { id, name: n.name, kind: n.kind, lat: n.lat, lon: n.lon };
};

describe('marking a place', () => {
  it('a river is all its stretches of that name nearby — not a namesake abroad', () => {
    expect(markShapeIds(mark('r1'), names).sort()).toEqual(['r1', 'r2']);
    expect(markShapeIds(mark('r9'), names)).toEqual(['r9']);
    expect(markShapeIds(mark('o1'), names).sort()).toEqual(['o1', 'o2']);
  });

  it('frames the whole shape; a city is ringed and flown to closely', () => {
    const shapes = {
      r1: [
        [
          [100, 26],
          [110, 30],
        ],
      ],
      r2: [
        [
          [110, 30],
          [121, 31.5],
        ],
      ],
    };
    const { draw, view } = markDraw(mark('r1'), names, shapes);
    expect(draw).toMatchObject({ closed: false, point: false, name: 'Yangtze' });
    expect(draw.lines).toHaveLength(2);
    expect(view.lon).toBeCloseTo(110.5, 1);
    expect(view.altitudeKm).toBeGreaterThan(1500);
    const paris = markDraw(mark('C1'), names, shapes);
    expect(paris.draw).toMatchObject({ point: true, lines: [] });
    expect(paris.view).toMatchObject({ lat: 48.87, lon: 2.33, altitudeKm: 350 });
  });

  it('several marks in one answer are framed together', () => {
    const lake = { id: 'l1', name: 'Lake Victoria', kind: 'l' as const, lat: -1, lon: 33 };
    const desert = { id: 'd1', name: 'Sahara', kind: 'd' as const, lat: 23, lon: 13 };
    const shapes = {
      l1: [
        [
          [31.5, -3],
          [34, -3],
          [34, 0.5],
          [31.5, 0.5],
        ],
      ],
      d1: [
        [
          [-15, 15],
          [35, 15],
          [35, 32],
          [-15, 32],
        ],
      ],
    };
    const view = marksView([lake, desert], [], shapes)!;
    // Between them, far enough out for both.
    expect(view.lat).toBeGreaterThan(5);
    expect(view.lat).toBeLessThan(20);
    expect(view.altitudeKm).toBeGreaterThan(5000);
    expect(marksView([], [], shapes)).toBeNull();
  });
});
