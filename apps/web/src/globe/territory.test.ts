import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { activeOn, parseOhmIndex, type OhmPolity } from './ohm';
import { LandSource, decodeLand, type LandJson } from './land';
import { clipLine, clipRing, polityShape, stitchRings, territoryScene } from './territory';
import { POWER_COLORS, polityColor, sideColor } from './territoryColors';

const polity = (name: string, ways: number[], tier: 2 | 3 = 2): OhmPolity => ({
  name,
  start: '1900',
  end: null,
  wikidata: null,
  label: [0, 0],
  bbox: [0, 0, 0, 0],
  ways,
  tier,
});

describe('rings from boundary ways', () => {
  // A unit square in three ways, the middle one drawn backwards.
  const square = [
    [0, 0, 1, 0, 1, 1],
    [0, 1, 1, 1],
    [0, 1, 0, 0],
  ];
  it('joins ways end to end, whichever way each was drawn', () => {
    const rings = stitchRings(square);
    expect(rings).toHaveLength(1);
    const ring = rings[0]!;
    expect(ring.slice(0, 2)).toEqual(ring.slice(-2));
    expect(ring).toHaveLength(10);
  });

  it('leaves out ways that never close, and keeps separate rings apart', () => {
    expect(stitchRings([[0, 0, 1, 0, 1, 1]])).toEqual([]);
    const island = [[5, 5, 6, 5, 6, 6, 5, 6, 5, 5]];
    expect(stitchRings([...square, ...island, [9, 9, 10, 10]])).toHaveLength(2);
  });

  it('takes loose ends a few kilometres apart as one corner', () => {
    // The square again, its last side stopping 0.02° short of where the first began.
    const rings = stitchRings([
      [0, 0, 1, 0, 1, 1],
      [1, 1, 0, 1],
      [0, 1, 0.01, 0.02],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0]!.slice(0, 2)).toEqual(rings[0]!.slice(-2));
  });

  it('closes a boundary left open along one stretch (a frontier not yet settled)', () => {
    // Three sides of a square: the gap (1°) is a quarter of the whole way round.
    const rings = stitchRings([[0, 0, 0, 1, 1, 1, 1, 0]]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toEqual([0, 0, 0, 1, 1, 1, 1, 0, 0, 0]);
    // A line that turns back on nothing is no country.
    expect(stitchRings([[0, 0, 1, 0, 2, 0.1]])).toEqual([]);
  });

  it('gives a country its shape, colour and extent — and runs a ring on past 180°', () => {
    const coarse = [...square, [179, 0, -179, 0, -179, 1, 179, 1, 179, 0]];
    const shape = polityShape(polity('French State', [0, 1, 2]), coarse)!;
    expect(shape.bbox).toEqual([0, 0, 1, 1]);
    expect(shape.area).toBeCloseTo(1);
    expect(shape.color).toBe(POWER_COLORS.france);
    const fiji = polityShape(polity('Fiji', [3]), coarse)!;
    expect(fiji.bbox[0]).toBe(179);
    expect(fiji.bbox[2]).toBe(181);
    expect(fiji.area).toBeCloseTo(2);
    expect(polityShape(polity('Nowhere', [99]), coarse)).toBeNull();
  });

  it('paints occupation regimes first, then states from the largest down', () => {
    const coarse = [
      [0, 0, 4, 0, 4, 4, 0, 4, 0, 0],
      [1, 1, 2, 1, 2, 2, 1, 2, 1, 1],
      [0, 0, 3, 0, 3, 3, 0, 3, 0, 0],
    ];
    const scene = territoryScene({
      active: [polity('Small', [1]), polity('Regime', [2], 3), polity('Large', [0])],
      coarse,
      zones: [],
      land: null,
      baseKey: 'k',
      zonesKey: 'z',
    });
    expect(scene.polities.map((p) => p.name)).toEqual(['Regime', 'Large', 'Small']);
    expect(scene.baseKey).toBe('k|');
    expect(scene.key).toBe('k||z');
  });

  it('knows where a country has a coast, and how far past it the colour may reach', () => {
    // A 4° square: its south side is coast ('1'), the rest inland ('2').
    const coarse = [
      [0, 0, 4, 0],
      [4, 0, 4, 4, 0, 4, 0, 0],
      [10, 10, 10.1, 10, 10.1, 10.1, 10, 10.1, 10, 10],
    ];
    const big = polityShape(polity('Coastland', [0, 1]), coarse, '121')!;
    expect(big.coast).toEqual([[0, 0, 4, 0]]);
    expect(big.reach).toBeCloseTo(0.2);
    // A city state reaches less far than a twelve-mile sea.
    const city = polityShape(polity('Port', [2]), coarse, '121')!;
    expect(city.coast).toHaveLength(1);
    expect(city.reach).toBeCloseTo(0.025);
    // Without the ways' classes nothing is known of coasts.
    expect(polityShape(polity('Unknown', [0, 1]), coarse)!.coast).toEqual([]);
  });

  it('redraws a country from the detailed ways as they load, keeping the coarse ones elsewhere', () => {
    const coarse = [
      [0, 0, 4, 0],
      [4, 0, 4, 4, 0, 4, 0, 0],
    ];
    const p = polity('Detailed', [0, 1]);
    const plain = polityShape(p, coarse, '12')!;
    expect(plain.fine).toBeNull();
    // The south side in detail: it dips to -0.5 half way.
    const fine = new Map([[0, [0, 0, 2, -0.5, 4, 0]]]);
    const shape = polityShape(p, coarse, '12', fine)!;
    expect(shape).not.toBe(plain);
    expect(shape.fine!.rings).toEqual([[0, 0, 2, -0.5, 4, 0, 4, 4, 0, 4, 0, 0]]);
    expect(shape.fine!.coast).toEqual([[0, 0, 2, -0.5, 4, 0]]);
    expect(shape.rings).toEqual(plain.rings);
    // The same detail again: the same object (what was drawn from it is kept).
    expect(polityShape(p, coarse, '12', new Map(fine))).toBe(shape);
  });
});

describe('cutting shapes to a map cell', () => {
  const square = [0, 0, 4, 0, 4, 4, 0, 4, 0, 0];
  /** A ring's corners, whichever it starts from. */
  const corners = (ring: number[] | null) =>
    (ring ?? [])
      .reduce<string[]>((out, v, k) => (k % 2 ? out : [...out, `${v},${ring![k + 1]}`]), [])
      .sort();
  it('keeps the part of a ring inside the box', () => {
    expect(corners(clipRing(square, 0, [1, 1, 2, 2]))).toEqual(['1,1', '1,2', '2,1', '2,2']);
    expect(clipRing(square, 0, [-1, -1, 5, 5])).toEqual(square.slice(0, -2));
    expect(clipRing(square, 0, [5, 5, 6, 6])).toBeNull();
    // Moved a whole turn east, it is found at 360–364.
    expect(corners(clipRing(square, 360, [361, 1, 362, 2]))).toEqual([
      '361,1',
      '361,2',
      '362,1',
      '362,2',
    ]);
  });

  it('keeps the runs of a line that pass through the box, with a point to either side', () => {
    const line = [0, 0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0];
    expect(clipLine(line, 0, [1.5, -1, 2.5, 1])).toEqual([[1, 0, 2, 0, 3, 0]]);
    expect(clipLine(line, 0, [10, 10, 11, 11])).toEqual([]);
  });
});

describe('the land outline', () => {
  it('decodes rings stored as differences in fractions of a degree', () => {
    const land = decodeLand({ scale: 100, land: [[100, 200, 50, 0, 0, 50, -50, 0]] });
    expect(land.land[0]!.flat).toEqual([1, 2, 1.5, 2, 1.5, 2.5, 1, 2.5]);
    expect(land.land[0]!.bbox).toEqual([1, 2, 1.5, 2.5]);
    expect(land.lakes).toEqual([]);
  });

  it('gives far tiles the coarse world, close tiles their cell — fetched once', async () => {
    const low = decodeLand({ scale: 1, land: [[0, 0, 10, 0, 0, 10]] });
    const asked: string[] = [];
    // Four cells of 90° along the equator's northern side… as a 4 × 2 grid of 90° cells.
    const index = { level: 1, deg: 90, cols: 4, rows: 2, kinds: '0000' + '2100' };
    const source = new LandSource(low, index, (name): Promise<LandJson> => {
      asked.push(name);
      return Promise.resolve({ scale: 1, land: [[-170, 10, 20, 0, 0, 20]] });
    });
    expect(source.detailed(0)).toBe(false);
    expect(source.forTile(-180, -90, 0)).toBe(low);
    expect(source.detailed(1)).toBe(true);
    // Southern cells are sea; the cell from 90°W to the meridian, north, is all land.
    expect(source.forTile(-180, -90, 1)).toBe('sea');
    expect(source.forTile(-90, 0, 3)).toBe('land');
    const first = source.forTile(-180, 0, 1);
    expect(first).toBeInstanceOf(Promise);
    const shape = await first;
    expect(shape).not.toBe('sea');
    expect(source.forTile(-135, 45, 4)).toBe(shape);
    expect(asked).toEqual(['c0_1']);
  });

  it('falls back to the coarse world when a cell cannot be fetched', async () => {
    const low = decodeLand({ scale: 1, land: [[0, 0, 10, 0, 0, 10]] });
    const source = new LandSource(low, { level: 0, deg: 180, cols: 2, rows: 1, kinds: '22' }, () =>
      Promise.reject(new Error('offline')),
    );
    expect(await source.forTile(-180, -90, 2)).toBe(low);
  });
});

describe('colours', () => {
  it('keeps one colour for a power across its versions, colonies and occupation regimes', () => {
    for (const name of ['German Reich', 'Generalgouvernement', 'Reichskommissariat Ostland'])
      expect(polityColor(name), name).toBe(POWER_COLORS.germany);
    for (const name of ['French State', 'French Republic', 'France', 'French West Africa'])
      expect(polityColor(name), name).toBe(POWER_COLORS.france);
    expect(polityColor('Soviet Union')).toBe(POWER_COLORS.ussr);
    expect(polityColor('Russian Empire')).toBe(POWER_COLORS.russia);
    expect(polityColor('Empire of Japan')).toBe(POWER_COLORS.japan);
    expect(polityColor('Manchukuo')).toBe(POWER_COLORS.japan);
    expect(polityColor('British Raj')).toBe(POWER_COLORS.uk);
  });

  it('gives any other country a stable colour, the same for its kingdom and its republic', () => {
    expect(polityColor('Kingdom of Hungary')).toBe(polityColor('Hungary'));
    expect(polityColor('Sweden')).toBe(polityColor('Sweden'));
    expect(polityColor('Sweden')).toMatch(/^hsl\(/);
    expect(sideColor('germany')).toBe(POWER_COLORS.germany);
    expect(sideColor('no-such-key')).toMatch(/^hsl\(/);
  });
});

describe('the bundled snapshot, with the corrections WorldLens makes', () => {
  const dir = path.resolve(__dirname, '../../public/data/ohm');
  const read = (f: string) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
  const index = parseOhmIndex(read('polities.json'));
  const coarse = (read('ways-coarse.json') as { ways: number[][] }).ways;
  const inside = (p: OhmPolity, lat: number, lon: number) => {
    const shape = polityShape(p, coarse);
    if (!shape) return false;
    let hit = false;
    for (const r of shape.rings)
      for (let k = 0; k + 3 < r.length; k += 2) {
        const [x1, y1, x2, y2] = [r[k]!, r[k + 1]!, r[k + 2]!, r[k + 3]!];
        if (y1 > lat !== y2 > lat && lon < x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1)) hit = !hit;
      }
    return hit;
  };
  /** Who holds a point on a day: countries, and ground carried where nobody is mapped. */
  const holders = (day: string, lat: number, lon: number) => ({
    countries: activeOn(index.polities, day)
      .filter((p) => inside(p, lat, lon))
      .map((p) => p.name),
    carried: activeOn(index.carried, day)
      .filter((p) => inside(p, lat, lon))
      .map((p) => p.name),
  });

  it('fills countries whose outline the source left open (Poland, 1920)', () => {
    const poland = activeOn(index.polities, '1920-06-01').find((p) => p.name === 'Poland')!;
    expect(polityShape(poland, coarse)!.rings.length).toBeGreaterThan(0);
    expect(inside(poland, 52.23, 21.01)).toBe(true);
  });

  it('has the countries the source lacks for years on end', () => {
    expect(holders('1900-06-01', 30.05, 31.25).countries).toContain('Khedivate of Egypt');
    expect(holders('1890-06-01', 15.6, 32.5).countries).toContain('Mahdist State');
    expect(holders('1947-06-01', 51.34, 12.37).countries).toContain(
      'Soviet occupation zone in Germany',
    );
    expect(holders('1955-06-01', 2.05, 45.3).countries).toContain('Trust Territory of Somaliland');
    expect(holders('1950-06-01', 64.2, -51.7).countries).toContain('Greenland');
    // … and has lost the row that was a boundary, and the name that was wrong.
    expect(index.polities.some((p) => /^Boundary\s/.test(p.name))).toBe(false);
    expect(
      index.polities.some((p) => p.name === 'British Guiana' && p.wikidata === 'Q1796551'),
    ).toBe(false);
  });

  it('carries ground where nobody is mapped, under the countries and inside its box', () => {
    // Chad in 1925, Martinique in 1900, the Faroes today, the French zone of Germany in 1947.
    expect(holders('1925-06-01', 12.1, 15.05).carried).toContain('French Equatorial Africa');
    expect(holders('1900-06-01', 14.65, -61.0).carried).toContain('Colony of Martinique');
    expect(holders('2020-06-01', 62.0, -6.85).carried).toContain('Denmark');
    expect(holders('1947-06-01', 47.99, 7.85).carried).toContain(
      'French occupation zone in Germany',
    );
    // Carried Martinique is cut from all of France: none of it reaches Paris.
    expect(holders('1900-06-01', 48.86, 2.35).carried).not.toContain('Colony of Martinique');
    for (const p of index.carried) {
      const shape = polityShape(p, coarse);
      if (!shape || !p.clip) continue;
      const [w, s, e, n] = p.clip;
      expect(shape.bbox[0], p.name).toBeGreaterThanOrEqual(w - 1e-6);
      expect(shape.bbox[1], p.name).toBeGreaterThanOrEqual(s - 1e-6);
      expect(shape.bbox[2], p.name).toBeLessThanOrEqual(e + 1e-6);
      expect(shape.bbox[3], p.name).toBeLessThanOrEqual(n + 1e-6);
    }
  });

  it('paints carried ground first, so whoever is mapped there covers it', () => {
    const day = '1947-06-01';
    const scene = territoryScene({
      active: activeOn(index.polities, day),
      carried: activeOn(index.carried, day),
      coarse,
      zones: [],
      land: null,
      baseKey: 'k',
      zonesKey: 'z',
    });
    const names = scene.polities.map((p) => p.name);
    const zone = names.indexOf('French occupation zone in Germany');
    expect(zone).toBeGreaterThanOrEqual(0);
    expect(zone).toBeLessThan(names.indexOf('American occupation zone in Germany'));
  });
});
