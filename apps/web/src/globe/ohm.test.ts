import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  activeOn,
  borderLines,
  flagFor,
  flagForPolity,
  followCountry,
  landBorders,
  parseOhmIndex,
  polityLabels,
  tilesInView,
  type OhmPolity,
  type Succession,
} from './ohm';

const polity = (name: string, start: string, end: string | null, ways: number[]): OhmPolity => ({
  name,
  start,
  end,
  wikidata: null,
  label: [0, 0],
  bbox: [0, 0, 1, 1],
  ways,
  tier: 2,
});

describe('OpenHistoricalMap dated borders', () => {
  // Ways: 1 Austria–Germany, 2 Austria–Switzerland, 3 Germany–Switzerland, 4 German coast.
  const austria = polity('Austria', '1922-10-01', '1938-03-13', [1, 2]);
  const reich36 = polity('German Reich', '1936-07-03', '1938-03-13', [1, 3, 4]);
  const reich38 = polity('German Reich', '1938-03-13', '1938-11-21', [2, 3, 4]);
  const swiss = polity('Switzerland', '1848', null, [2, 3]);
  const all = [austria, reich36, reich38, swiss];

  it('uses start ≤ day < end, with partial dates', () => {
    expect(activeOn(all, '1938-03-12').map((p) => p.name)).toEqual([
      'Austria',
      'German Reich',
      'Switzerland',
    ]);
    expect(activeOn(all, '1938-03-13')).toEqual([reich38, swiss]);
    expect(activeOn([polity('X', '1938', '1939', [])], '1938-01-01')).toHaveLength(1);
    expect(activeOn([polity('X', '1938', '1939', [])], '1939-01-01')).toHaveLength(0);
  });

  it('draws land borders only (shared by two active polities), not coastlines', () => {
    expect(landBorders(activeOn(all, '1938-03-12'))).toEqual([1, 2, 3]);
    // After the Anschluss the Austria–Germany border (1) is gone; 2 is now German–Swiss.
    expect(landBorders(activeOn(all, '1938-03-13'))).toEqual([2, 3]);
  });

  it('draws inland one-sided borders, never coastlines or lines at sea, and one copy of a doubled border', () => {
    // 0 shared (land), 1 shared at sea, 2 one-sided coastline, 3 one-sided inland (neighbour
    // missing), 4 and 5: the same border mapped separately by A and B.
    const coarse = [
      [0, 0, 0, 1],
      [5, 0, 5, 1],
      [9, 0, 9, 1],
      [20, 0, 20, 1],
      [30, 0, 30, 0.5, 30, 1],
      [30.01, 0, 30.01, 0.5, 30.01, 1],
    ];
    const classes = '201222';
    const a = polity('A', '1900', null, [0, 1, 2, 3, 4]);
    const b = polity('B', '1900', null, [0, 1, 5]);
    expect(landBorders([a, b], coarse, classes)).toEqual([0, 3, 4]);
    expect(landBorders([a, b])).toEqual([0, 1]); // without classes: shared ways only
  });

  it('decodes delta-encoded way lists', () => {
    const idx = parseOhmIndex({
      retrieved: '2026-10-15',
      tileDeg: 30,
      tiles: ['6_4'],
      polities: [['A', '1900', null, 'Q1', [1, 2], [0, 0, 3, 3], [5, 2, 10]]],
    });
    expect(idx.polities[0]!.ways).toEqual([5, 7, 17]);
    expect(idx.tiles.has('6_4')).toBe(true);
  });

  it('prefers detailed geometry and culls lines far from the view', () => {
    const coarse = [
      [0, 0, 1, 1],
      [100, 10, 101, 11],
    ];
    const fine = new Map([[0, [0, 0, 0.5, 0.6, 1, 1]]]);
    const lines = borderLines([0, 1], coarse, fine);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.geometry.coordinates).toHaveLength(3);
    expect(borderLines([0, 1], coarse, fine, '-1,-1,2,2')).toHaveLength(1);
  });

  it('finds detail tiles in view, across the antimeridian too', () => {
    const idx = parseOhmIndex({
      retrieved: '',
      tileDeg: 30,
      tiles: ['6_4', '7_4', '0_4', '11_4'],
      polities: [],
    });
    expect(tilesInView('5,45,25,55', idx).sort()).toEqual(['6_4']);
    expect(tilesInView('170,40,-170,50', idx).sort()).toEqual(['0_4', '11_4']);
    expect(tilesInView(null, idx)).toEqual([]);
  });

  it('labels the polities in view, largest first', () => {
    const big = {
      ...polity('Big', '1900', null, []),
      label: [10, 50] as [number, number],
      bbox: [0, 40, 20, 60] as [number, number, number, number],
    };
    const small = {
      ...polity('Small', '1900', null, []),
      label: [12, 48] as [number, number],
      bbox: [11, 47, 13, 49] as [number, number, number, number],
    };
    const away = { ...polity('Away', '1900', null, []), label: [120, 30] as [number, number] };
    expect(polityLabels([small, big, away], '0,40,30,60').map((l) => l.name)).toEqual([
      'Big',
      'Small',
    ]);
  });
});

describe('flags follow their own dates', () => {
  const p = { start: '1800', end: null };
  const reich: Array<[string, string | null, string | null, boolean]> = [
    ['imperial.svg', '1871-04-16', '1919-04-11', true],
    ['weimar.svg', '1919-04-11', '1933-03-12', false],
    ['interim.svg', '1933-03-12', '1935-09-15', false],
    ['nazi.svg', '1935-09-15', '1945-09-20', false],
  ];
  it('picks the flag in use on the day', () => {
    expect(flagFor(reich, p, '1900-01-01')?.file).toBe('imperial.svg');
    expect(flagFor(reich, p, '1934-06-01')?.file).toBe('interim.svg');
    expect(flagFor(reich, p, '1941-07-01')?.file).toBe('nazi.svg');
  });
  it('never shows an undated (current) flag for an era before the dated ones end', () => {
    const flags: Array<[string, string | null, string | null, boolean]> = [
      ['old.svg', '1924', '1960', false],
      ['current.svg', null, null, true],
    ];
    expect(flagFor(flags, p, '1950-01-01')?.file).toBe('old.svg');
    expect(flagFor(flags, p, '1990-01-01')?.file).toBe('current.svg');
    expect(flagFor(flags, p, '1850-01-01')).toBeNull();
  });
  it('falls back to the nearest flag within five years, marked as such', () => {
    const f = flagFor([['later.svg', '1903', null, false]], p, '1900-01-01');
    expect(f).toMatchObject({ file: 'later.svg', nearest: true });
    expect(flagFor([['much-later.svg', '1920', null, false]], p, '1900-01-01')).toBeNull();
  });
  it('uses a related state when a period item lists no flag, naming whose flag it is', () => {
    const items = {
      Q1: { label: 'Fascist Italy', flags: [], related: ['Q2'] },
      Q2: {
        label: 'Kingdom of Italy',
        flags: [['italy.svg', '1861', '1947', false]] as Array<
          [string, string | null, string | null, boolean]
        >,
      },
    };
    expect(flagForPolity(items, 'Q1', p, '1941-07-01')).toMatchObject({
      file: 'italy.svg',
      owner: 'Kingdom of Italy',
    });
    expect(flagForPolity(items, 'Q1', p, '1960-01-01')).toBeNull();
  });
});

describe('the bundled OpenHistoricalMap snapshot', () => {
  // Vitest provides __dirname in test modules.
  const file = path.resolve(__dirname, '../../public/data/ohm/polities.json');
  const index = parseOhmIndex(JSON.parse(readFileSync(file, 'utf8')));
  const names = (day: string) => new Set(activeOn(index.polities, day).map((p) => p.name));

  it('changes on the exact day: the Anschluss, 13 March 1938', () => {
    expect(names('1938-03-12').has('Austria')).toBe(true);
    expect(names('1938-03-13').has('Austria')).toBe(false);
    expect(names('1938-03-13').has('German Reich')).toBe(true);
  });

  it('covers wars beyond Europe and the present day', () => {
    expect(names('1968-01-01').has('Biafra')).toBe(true);
    expect(names('1970-02-01').has('Biafra')).toBe(false);
    expect(names('1940-01-01').has('Manchukuo')).toBe(true);
    expect(activeOn(index.polities, '2026-01-01').length).toBeGreaterThan(150);
    expect(landBorders(activeOn(index.polities, '1941-07-01')).length).toBeGreaterThan(1000);
  });
});

describe('a selected country follows the timeline', () => {
  const dir = path.resolve(__dirname, '../../public/data/ohm');
  const read = (f: string) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
  const index = parseOhmIndex(read('polities.json'));
  const succession = read('succession.json').items as Succession;
  const coarse = (read('ways-coarse.json') as { ways: number[][] }).ways;
  const at = (name: string, day: string) => {
    const p = activeOn(index.polities, day).find((q) => q.name === name);
    if (!p) throw new Error(`${name} not in force on ${day}`);
    return p;
  };
  const follow = (name: string, from: string, to: string) =>
    followCountry(at(name, from), index.polities, succession, to, coarse);
  const lands = (r: ReturnType<typeof follow>) =>
    r.kind === 'switch' ? `${r.polity.name} ${r.polity.start}` : r.kind;

  it('stays while the selected borders are in force', () => {
    expect(follow('German Reich', '1941-09-01', '1943-01-01').kind).toBe('keep');
  });

  it('moves to the same country’s borders of the day (Nazi Germany → Weimar Republic)', () => {
    const r = follow('German Reich', '1941-09-01', '1930-06-01');
    expect(r).toMatchObject({ kind: 'switch', how: 'same' });
    expect(lands(r)).toBe('German Reich 1922-06-20');
    // The German Empire (another Wikidata id) is the same country in Wikidata's terms.
    expect(lands(follow('German Reich', '1930-06-01', '1910-01-01'))).toBe(
      'German Reich 1890-07-01',
    );
  });

  it('moves to a successor going forward, a predecessor going back', () => {
    const zone = follow('German Reich', '1941-09-01', '1946-06-01');
    expect(zone).toMatchObject({ kind: 'switch', how: 'successor' });
    expect(lands(zone)).toMatch(/occupation zone in Germany/);
    expect(
      lands(follow('American occupation zone in Germany', '1947-01-01', '1951-01-01')),
    ).toMatch(/^West Germany/);
    expect(lands(follow('Soviet Union', '1980-01-01', '1995-01-01'))).toMatch(/^Russia/);
    const back = follow('West Germany', '1950-01-01', '1947-06-01');
    expect(back).toMatchObject({ kind: 'switch', how: 'predecessor' });
  });

  it('keeps the selection over a short hole in the data', () => {
    // Kingdom of Prussia: no version between 20 Sep and 1 Oct 1866.
    expect(follow('Kingdom of Prussia', '1866-06-01', '1866-09-25').kind).toBe('keep');
  });

  it('closes when nothing continues the country', () => {
    const island = (name: string, start: string, end: string | null, ways: number[]) => ({
      ...polity(name, start, end, ways),
      wikidata: name,
    });
    const gone = island('Q1', '1900', '1910', [1, 2]);
    const other = {
      ...island('Q2', '1905', null, [3, 4]),
      bbox: [5, 5, 6, 6] as OhmPolity['bbox'],
    };
    expect(followCountry(gone, [gone, other], {}, '1920-01-01').kind).toBe('close');
    // …but a neighbour that took over most of its border continues it.
    const heir = island('Q3', '1910', null, [1, 2, 5]);
    expect(followCountry(gone, [gone, heir], {}, '1920-01-01')).toMatchObject({
      kind: 'switch',
      how: 'border',
    });
  });
});
