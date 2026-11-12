import { describe, expect, it } from 'vitest';
import {
  changesBetween,
  controlAreas,
  delaunay,
  frontAt,
  heldByA,
  landTestFrom,
  placeLevel,
  recentChanges,
  type FrontPlace,
  type FrontTheatre,
} from '../fronts';

const place = (name: string, lon: number, lat: number, ...held: Array<[number, number]>) =>
  ({ name, lon, lat, held }) satisfies FrontPlace;

const theatre = (places: FrontPlace[], o: Partial<FrontTheatre> = {}): FrontTheatre => ({
  id: 'test',
  name: 'Test Front',
  war: 'Test War',
  conflictId: 'conflict-test',
  sideA: 'A',
  sideB: 'B',
  start: 0,
  end: 1000,
  horizonDays: 30,
  maxEdgeKm: 2000,
  clipToLand: true,
  places,
  colorA: 'a',
  colorB: 'b',
  politiesA: '^a$',
  politiesB: '^b$',
  sources: [],
  ...o,
});

/** Three columns of places, 1° apart (lon 10, 11, 12), rows at lat 50…54. */
function columns(held: (col: number, row: number) => Array<[number, number]>): FrontPlace[] {
  const out: FrontPlace[] = [];
  for (let col = 0; col < 3; col++)
    for (let row = 0; row < 5; row++)
      out.push(place(`c${col}r${row}`, 10 + col, 50 + row, ...held(col, row)));
  return out;
}

const lons = (lines: number[][][]) => lines.flat().map((p) => p[0]!);

describe('delaunay', () => {
  it('triangulates so that no point lies inside another triangle’s circle', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 100;
    const x = Array.from({ length: 60 }, rnd);
    const y = Array.from({ length: 60 }, rnd);
    const tris = delaunay(x, y);
    expect(tris.length).toBeGreaterThan(60);
    for (const [a, b, c] of tris) {
      const ax = x[a]!;
      const ay = y[a]!;
      const bx = x[b]! - ax;
      const by = y[b]! - ay;
      const cx = x[c]! - ax;
      const cy = y[c]! - ay;
      const d = 2 * (bx * cy - by * cx);
      const ux = (cy * (bx * bx + by * by) - by * (cx * cx + cy * cy)) / d;
      const uy = (bx * (cx * cx + cy * cy) - cx * (bx * bx + by * by)) / d;
      const r = Math.hypot(ux, uy);
      for (let p = 0; p < x.length; p++) {
        if (p === a || p === b || p === c) continue;
        expect(Math.hypot(x[p]! - ax - ux, y[p]! - ay - uy)).toBeGreaterThan(r * (1 - 1e-6));
      }
    }
  });

  it('copes with too few, repeated and collinear points', () => {
    expect(delaunay([0, 1], [0, 1])).toEqual([]);
    expect(delaunay([0, 1, 2, 3], [0, 0, 0, 0]).length).toBeLessThanOrEqual(2);
    expect(delaunay([0, 0, 1, 0], [0, 0, 0, 1]).length).toBeGreaterThan(0);
  });
});

describe('a place’s level', () => {
  const p = place('x', 0, 0, [100, 200]);
  it('is positive while held, negative otherwise, and grows with distance in time', () => {
    expect(heldByA(p, 100)).toBe(true);
    expect(heldByA(p, 200)).toBe(false);
    expect(placeLevel(p, 115, 30)).toBeCloseTo(0.5);
    expect(placeLevel(p, 150, 30)).toBe(1);
    expect(placeLevel(p, 185, 30)).toBeCloseTo(0.5);
    expect(placeLevel(p, 85, 30)).toBeCloseTo(-0.5);
    expect(placeLevel(p, 0, 30)).toBe(-1);
    expect(placeLevel(p, 215, 30)).toBeCloseTo(-0.5);
    // Never exactly zero: the line always has a side to be on.
    expect(placeLevel(p, 100, 30)).toBeGreaterThan(0);
    expect(placeLevel(p, 99.9999, 30)).toBeLessThan(0);
    expect(placeLevel(place('never', 0, 0), 50, 30)).toBe(-1);
  });
});

describe('the front between places held and not held', () => {
  it('rests half-way between them while nothing changes hands', () => {
    const t = theatre(columns((col) => (col === 0 ? [[-999, 9999]] : [])));
    const { lines, alongA, alongB } = frontAt(t, 500);
    expect(lines).toHaveLength(1);
    for (const lon of lons(lines)) expect(lon).toBeCloseTo(10.5, 5);
    expect(alongA.map((i) => t.places[i]!.name).sort()).toEqual(
      ['c0r0', 'c0r1', 'c0r2', 'c0r3', 'c0r4'].sort(),
    );
    expect(alongB.every((i) => t.places[i]!.name.startsWith('c1'))).toBe(true);
  });

  it('moves toward a place before it falls, crosses it on the day, then moves on', () => {
    // The middle column falls on day 100.
    const t = theatre(
      columns((col) => (col === 0 ? [[-999, 9999]] : col === 1 ? [[100, 9999]] : [])),
    );
    const mean = (day: number) => {
      const xs = lons(frontAt(t, day).lines);
      return xs.reduce((s, v) => s + v, 0) / xs.length;
    };
    expect(mean(40)).toBeCloseTo(10.5, 5); // more than a horizon away: at rest
    expect(mean(85)).toBeGreaterThan(10.6);
    expect(mean(85)).toBeLessThan(11);
    expect(mean(99.99)).toBeCloseTo(11, 1);
    expect(mean(100.01)).toBeCloseTo(11, 1);
    expect(mean(115)).toBeGreaterThan(11.2);
    expect(mean(140)).toBeCloseTo(11.5, 5); // at rest again, half-way to the last column
    // Day by day it never jumps or turns back.
    let last = mean(60);
    for (let day = 61; day <= 140; day++) {
      const now = mean(day);
      expect(now).toBeGreaterThanOrEqual(last - 1e-9);
      expect(now - last).toBeLessThan(0.06);
      last = now;
    }
    // Hours count too (once past the day it fell: the line pauses on the place itself).
    expect(mean(103.5)).toBeGreaterThan(mean(103.25));
  });

  it('draws a ring around an encircled place', () => {
    const t = theatre(columns((col, row) => (col === 1 && row === 2 ? [] : [[-999, 9999]])));
    const { lines } = frontAt(t, 500);
    expect(lines).toHaveLength(1);
    const ring = lines[0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const [lon, lat] of ring) expect(Math.hypot(lon - 11, lat - 52)).toBeLessThan(0.8);
  });

  it('has no line outside the theatre’s dates, nor across ground with no places', () => {
    const places = columns((col) => (col === 0 ? [[-999, 9999]] : []));
    expect(frontAt(theatre(places, { start: 100, end: 200 }), 99).lines).toEqual([]);
    expect(frontAt(theatre(places, { start: 100, end: 200 }), 201).lines).toEqual([]);
    expect(frontAt(theatre(places, { start: 100, end: 200 }), 150).lines).toHaveLength(1);
    // Places 1° (about 70 km at this latitude) apart: none of their triangles fit in 40 km.
    expect(frontAt(theatre(places, { maxEdgeKm: 40 }), 500).lines).toEqual([]);
  });

  it('clips what is at sea, unless the theatre is one of islands', () => {
    const places = columns((col) => (col === 0 ? [[-999, 9999]] : []));
    const northOnly = (_lon: number, lat: number) => lat >= 52;
    const clipped = frontAt(theatre(places), 500, northOnly).lines;
    expect(clipped).toHaveLength(1);
    for (const [, lat] of clipped[0]!) expect(lat).toBeGreaterThanOrEqual(52);
    const whole = frontAt(theatre(places, { clipToLand: false }), 500, northOnly).lines;
    expect(Math.min(...whole[0]!.map((p) => p[1]!))).toBeLessThan(51);
  });

  it('leaves out ground across a neutral country', () => {
    const places = columns((col) => (col === 0 ? [[-999, 9999]] : []));
    // The whole middle column is neutral: no triangle joins the two sides any more.
    for (const p of places) if (p.name.startsWith('c1')) (p as FrontPlace).neutral = true;
    const t = theatre(places);
    expect(frontAt(t, 500).lines).toEqual([]);
    const { a, b } = controlAreas(t, 500);
    expect(a.length + b.length).toBe(0);
  });

  it('gives the ground each side holds, meeting along the front', () => {
    const t = theatre(columns((col) => (col === 0 ? [[-999, 9999]] : [])));
    const { a, b } = controlAreas(t, 500);
    const area = (polys: number[][][]) =>
      polys.reduce((sum, poly) => {
        let s = 0;
        for (let i = 0; i < poly.length; i++) {
          const [x1, y1] = poly[i]!;
          const [x2, y2] = poly[(i + 1) % poly.length]!;
          s += x1! * y2! - x2! * y1!;
        }
        return sum + Math.abs(s) / 2;
      }, 0);
    // Columns at lon 10, 11, 12 and rows 50…54: side A holds lon 10–10.5, side B the rest.
    expect(area(a)).toBeCloseTo(0.5 * 4, 3);
    expect(area(b)).toBeCloseTo(1.5 * 4, 3);
    for (const poly of a) for (const [lon] of poly) expect(lon).toBeLessThanOrEqual(10.5 + 1e-6);
    for (const poly of b) for (const [lon] of poly) expect(lon).toBeGreaterThanOrEqual(10.5 - 1e-6);
    expect(controlAreas(theatre(t.places, { start: 600 }), 500)).toEqual({ a: [], b: [] });
  });

  it('carries the ground a little offshore, so capes beyond the last town are covered', () => {
    const t = theatre(columns((col) => (col === 0 ? [[-999, 9999]] : [])));
    const east = (areas: { a: number[][][]; b: number[][][] }) =>
      Math.max(...[...areas.a, ...areas.b].flat().map((p) => p[0]!));
    // No land test: the ground ends at the outermost places (lon 12).
    expect(east(controlAreas(t, 500))).toBeCloseTo(12, 5);
    // Sea everywhere beyond them: it reaches out past the coast.
    const coast = (lon: number, lat: number) => lon >= 10 && lon <= 12 && lat >= 50 && lat <= 54;
    expect(east(controlAreas(t, 500, coast))).toBeGreaterThan(12.5);
    // Land all around (an inland theatre): the ground is carried outward there too — country
    // beyond the outermost places is on one side or the other, as the nearest of them is…
    const inland = theatre(t.places);
    expect(east(controlAreas(inland, 500, () => true))).toBeGreaterThan(12.5);
    // … but the line is drawn only between places that are known.
    const lats = frontAt(inland, 500, () => true)
      .lines.flat()
      .map((p) => p[1]!);
    expect(Math.min(...lats)).toBeGreaterThanOrEqual(50 - 1e-6);
    expect(Math.max(...lats)).toBeLessThanOrEqual(54 + 1e-6);
  });

  it('lists what changed hands', () => {
    const t = theatre([place('X', 10, 50, [100, 200]), place('Y', 11, 50, [150, 9999])]);
    expect(changesBetween(t, 90, 160)).toEqual({ toA: ['X', 'Y'], toB: [] });
    expect(changesBetween(t, 160, 300)).toEqual({ toA: [], toB: ['X'] });
    expect(recentChanges(t, 205, 60)).toEqual([
      { place: 'X', day: 200, to: 'b' },
      { place: 'Y', day: 150, to: 'a' },
    ]);
  });
});

describe('the land mask', () => {
  it('decodes run lengths, sea first', () => {
    // 4 columns × 2 rows of 90°: south row all sea; north row: sea, land, land, sea.
    const land = landTestFrom({ res: 90, rows: ['', '1.2.1'] });
    expect(land(-170, -45)).toBe(false);
    expect(land(-170, 45)).toBe(false);
    expect(land(-45, 45)).toBe(true);
    expect(land(45, 45)).toBe(true);
    expect(land(170, 45)).toBe(false);
    expect(land(0, 95)).toBe(false);
  });
});
