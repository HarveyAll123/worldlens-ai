/**
 * Corrections WorldLens makes to OpenHistoricalMap's dated countries after downloading them
 * (`pnpm data:ohm`, or `pnpm data:ohm-patch` on the files already built). OHM stays the source;
 * these are the places where its record, drawn day by day, shows something that was not so:
 *
 *  - dates given only as a year, which put an occupation regime on the map months early, and
 *    countries ended on the day a law renamed them, with nothing mapped after;
 *  - a country missing between two of its versions, or for years on end (Egypt 1881–1914);
 *  - gaps: a country ends and nothing covers its ground until another begins a little later
 *    (often a year-only date on one side);
 *  - rows that are not countries, and one mislabelled.
 *
 * Two kinds of repair. A country OHM lacks is added with the shape of a version it has, under
 * its name of the time (borders and label included). Ground that is merely unaccounted for is
 * "carried": the shape of whoever holds it next (or held it last) is painted there, under
 * everything else, with no border or label of its own — those rows go in the index's
 * `carried`, apart from the countries. Every change is listed in `patches` / `carriedNotes`.
 */
import type { LandTest } from '../../packages/shared/src/fronts';
import { ringFrom, stitchOrder, unwrapRing } from '../../packages/shared/src/rings';

export type Box = [west: number, south: number, east: number, north: number];

export type PolityRow = [
  name: string,
  start: string,
  end: string | null,
  wikidata: string | null,
  label: [number, number],
  bbox: [number, number, number, number],
  waysDelta: number[],
  tier?: 2 | 3,
  /** Carried rows only: the part of the shape that is painted. */
  clip?: Box,
];

/** Rows that are not countries. */
const DROPS: Array<{ name: RegExp; why: string }> = [
  {
    name: /^Boundary\s+Finland-USSR/i,
    why: 'A boundary line mapped as if it were a country.',
  },
];

/** Names corrected, found by the name and Wikidata id OHM gives. */
const NAME_FIXES: Array<{ name: string; wikidata: string; to: string; why: string }> = [
  {
    name: 'British Guiana',
    wikidata: 'Q1796551',
    to: 'British Leeward Islands',
    why: 'The Leeward Islands colony (its Wikidata id) carries the name of British Guiana.',
  },
];

/** Dates corrected, found by the name and start date OHM gives. `end: null` leaves it open. */
const DATE_FIXES: Array<{
  name: string;
  start: string;
  set: { start?: string; end?: string | null };
  why: string;
}> = [
  {
    name: 'Reichskommissariat Ostland',
    start: '1941',
    set: { start: '1941-07-25' },
    why: 'Set up on 25 July 1941; the year alone drew it before the invasion of 22 June 1941.',
  },
  {
    name: 'Bezirk Bialystok',
    start: '1941',
    set: { start: '1941-08-01' },
    why: 'German civil administration from 1 August 1941; the year alone drew it while the district was Soviet.',
  },
  {
    name: 'Bezirk Bialystok',
    start: '1943',
    set: { end: '1944-07-27' },
    why: 'Białystok was retaken by the Red Army on 27 July 1944.',
  },
  {
    name: 'French State',
    start: '1943-09-08',
    set: { end: '1944-08-25' },
    why: 'Paris was liberated on 25 August 1944 and the Provisional Government took over.',
  },
  {
    name: 'Poland',
    start: '1938-11-01',
    set: { end: '1939-10-06' },
    why: 'The last Polish army in the field surrendered on 6 October 1939; OHM keeps Poland whole until the annexation decrees of 26 October, over ground it already gives the Soviet Union.',
  },
  {
    name: 'Turco-Egyptian Sudan',
    start: '1820',
    set: { end: '1885-01-26' },
    why: 'Egyptian rule lasted until the Mahdists took Khartoum on 26 January 1885 (OHM ends it in 1867 with nothing after).',
  },
  {
    name: 'Greenland',
    start: '1953-06-05',
    set: { end: '1979-05-01' },
    why: 'Greenland stayed a Danish county until home rule on 1 May 1979 (OHM leaves 1974–79 empty).',
  },
  {
    name: 'La Réunion',
    start: '1848-06-09',
    set: { end: null },
    why: 'Still French: made an overseas department on 19 March 1946, which OHM takes as its end without mapping it in France.',
  },
  ...(
    [
      ['British Virgin Islands', '1959-12-31'],
      ['Montserrat', '1962-08-31'],
      ['Cayman Islands', '1990-01-01'],
      ['Colony of the Turks and Caicos Islands', '1990-01-01'],
    ] as const
  ).map(([name, start]) => ({
    name,
    start,
    set: { end: null },
    why: 'Still a British territory: the British Overseas Territories Act of 26 February 2002 renamed it, which OHM takes as its end.',
  })),
];

/** Countries missing from OHM for a time, drawn with the shape of a version it has. */
const ADDITIONS: Array<{
  name: string;
  start: string;
  end: string;
  like: { name: string; start: string };
  why: string;
}> = [
  {
    name: 'France',
    start: '1944-08-25',
    end: '1945-04-22',
    like: { name: 'France', start: '1945-04-22' },
    why: 'Provisional Government of the French Republic: OHM has no France between the French State (to August 1944) and April 1945.',
  },
  {
    name: 'Belgium',
    start: '1944-09-03',
    end: '1945',
    like: { name: 'Belgium', start: '1945' },
    why: 'Brussels was liberated on 3 September 1944; OHM has no Belgium between the German administration (to that day) and 1945.',
  },
  {
    name: 'Kingdom of Romania',
    start: '1944-04-01',
    end: '1945-03-09',
    like: { name: 'Kingdom of Romania', start: '1940-09-07' },
    why: 'OHM has no Romania between April 1944 and March 1945; drawn as it was before it retook Bessarabia in 1941 (the Red Army had reached the Prut).',
  },
  {
    name: 'Khedivate of Egypt',
    start: '1881-07-02',
    end: '1914-12-19',
    like: { name: 'Sultanate of Egypt', start: '1914-12-19' },
    why: 'OHM drops Egypt from the Ottoman Empire in 1881 and maps nothing there until the Sultanate of December 1914; it was the Khedivate (under British occupation from 1882).',
  },
  {
    name: 'Ottoman Tripolitania',
    start: '1881-07-02',
    end: '1911',
    like: { name: 'Italian Tripolitania', start: '1911' },
    why: 'Libya was Ottoman until the Italian invasion of 1911; OHM maps nothing there after 1881.',
  },
  {
    name: 'Ottoman Cyrenaica',
    start: '1881-07-02',
    end: '1911',
    like: { name: 'Italian Cyrenaica', start: '1911' },
    why: 'Libya was Ottoman until the Italian invasion of 1911; OHM maps nothing there after 1881.',
  },
  {
    name: 'Mahdist State',
    start: '1885-01-26',
    end: '1899-06-19',
    like: { name: 'Turco-Egyptian Sudan', start: '1820' },
    why: 'The Mahdist State held the Sudan from the fall of Khartoum to the Anglo-Egyptian reconquest; drawn with the outline of Egyptian Sudan, the nearest OHM has.',
  },
  {
    name: 'Trust Territory of Somaliland',
    start: '1950-04-01',
    end: '1960-07-01',
    like: { name: 'Italian Somaliland', start: '1928-08-02' },
    why: 'Under Italian administration for the United Nations from 1 April 1950 until independence; OHM maps nothing there.',
  },
  {
    name: 'Greenland',
    start: '1945',
    end: '1953-06-05',
    like: { name: 'Greenland', start: '1953-06-05' },
    why: 'A Danish colony until 1953; OHM maps nothing there after the American occupation.',
  },
  {
    name: 'Soviet occupation zone in Germany',
    start: '1945-07-01',
    end: '1949-10-07',
    like: { name: 'East Germany', start: '1949-10-07' },
    why: 'OHM maps the American and British zones but not the Soviet one, which became East Germany.',
  },
  {
    name: 'Kingdom of Yemen',
    start: '1918-10-30',
    end: '1934-06-14',
    like: { name: 'Kingdom of Yemen', start: '1934-06-14' },
    why: 'Independent from the Ottoman armistice of 30 October 1918; OHM begins it in 1934.',
  },
  {
    name: 'Kingdom of Hejaz and Nejd',
    start: '1926-01-08',
    end: '1932-09-23',
    like: { name: 'Saudi Arabia', start: '1932-09-23' },
    why: 'Ibn Saud was proclaimed King of Hejaz on 8 January 1926; the realm was renamed Saudi Arabia in 1932, where OHM begins.',
  },
  {
    name: 'Senegal',
    start: '1958-12-11',
    end: '1960-06-20',
    like: { name: 'Senegal', start: '1960-08-20' },
    why: 'An autonomous republic from November 1958 (in the Mali Federation from 1959); OHM maps nothing there until June 1960.',
  },
];

/**
 * Ground painted with a shape OHM has, where it maps nobody: no border, no label. `clip`
 * keeps it to one part of that shape. `end: null` leaves it open.
 */
const CARRIED: Array<{
  name: string;
  like: { name: string; start: string };
  start: string;
  end: string | null;
  clip?: Box;
  why: string;
}> = [
  {
    name: 'Denmark',
    like: { name: 'Denmark', start: '1932-01-30' },
    start: '1944-06-17',
    end: null,
    clip: [-8, 61.2, -6, 62.5],
    why: 'The Faroe Islands stayed Danish; OHM leaves them out of Denmark after Iceland went its own way in 1944.',
  },
  {
    name: 'Colony of Martinique',
    like: { name: 'France', start: '1946-03-14' },
    start: '1700',
    end: '1946-03-14',
    clip: [-61.3, 14.3, -60.7, 14.95],
    why: 'French since 1635 (bar two British occupations); OHM first maps it as part of France in 1946.',
  },
  {
    name: 'France',
    like: { name: 'Colony of Guadelupe', start: '1878' },
    start: '1946-03-14',
    end: null,
    clip: [-63.2, 17.85, -62.75, 18.15],
    why: 'Saint-Martin and Saint-Barthélemy stayed French when Guadeloupe became a department; OHM leaves them out of France.',
  },
  {
    name: 'Curaçao and Dependencies',
    like: { name: 'Kingdom of the Netherlands', start: '1848-10-14' },
    start: '1816',
    end: '1848-10-14',
    clip: [-70.2, 11.9, -68.1, 12.7],
    why: 'Dutch since 1634 (returned by Britain in 1816); OHM first maps the islands in 1848.',
  },
  {
    name: 'Far Eastern Republic',
    like: { name: 'Russian Soviet Federative Socialist Republic', start: '1920' },
    start: '1920-04-06',
    end: '1922-11-15',
    why: 'The buffer state between Soviet Russia and the Japanese intervention, 6 April 1920 to 15 November 1922; OHM cuts it out of Russia and maps nothing there.',
  },
  {
    name: 'French Equatorial Africa',
    like: { name: 'French Equatorial Africa', start: '1934-06-30' },
    start: '1916-07-20',
    end: '1934-06-30',
    why: 'OHM’s French Equatorial Africa of 1916–34 is Gabon and the Middle Congo only: Ubangi-Shari and Chad, part of it throughout, are left to nobody.',
  },
  {
    name: 'French Laos',
    like: { name: 'Indochinese Union', start: '1906' },
    start: '1893-10-03',
    end: '1906',
    clip: [100, 13.5, 108, 22.7],
    why: 'Siam ceded the left bank of the Mekong to France on 3 October 1893; OHM adds it to Indochina only in 1904–06.',
  },
  {
    name: 'French protectorate in Morocco',
    like: { name: 'French protectorate in Morocco', start: '1926-05-27' },
    start: '1912-03-30',
    end: '1926-05-27',
    why: 'The protectorate dates from the Treaty of Fez (30 March 1912); OHM draws it only as far as the French army had reached, and leaves the south to nobody.',
  },
  {
    name: 'Kingdom of Mysore',
    like: { name: 'Mughal Empire', start: '1793' },
    start: '1805',
    end: '1819',
    clip: [74.5, 11.5, 78.7, 15.3],
    why: 'Mysore, a princely state under British protection from 1799; OHM maps nothing there between 1805 and 1819.',
  },
  {
    name: 'Russian Empire',
    like: { name: 'Kazakh Khanate', start: '1520' },
    start: '1847',
    end: '1868',
    why: 'The Kazakh steppe was under Russian rule when the khanate ended in 1847; OHM adds it to the empire in 1868.',
  },
  {
    name: 'French occupation zone in Germany',
    like: { name: 'West Germany', start: '1949-05-23' },
    start: '1945-07-01',
    end: '1949-05-23',
    why: 'OHM maps the American and British zones but not the French one; it shows where they do not cover West Germany’s later outline.',
  },
  {
    name: 'French Algeria',
    like: { name: 'Regency of Algiers', start: '1516' },
    start: '1830-07-05',
    end: '1871-05-10',
    why: 'The French conquest began with the fall of Algiers on 5 July 1830; OHM maps nothing there until Algeria appears inside France.',
  },
  {
    name: 'Sikh Empire',
    like: { name: 'Mughal Empire', start: '1793' },
    start: '1805',
    end: '1849-03-29',
    clip: [70, 28.8, 80.5, 37],
    why: 'The Punjab and Kashmir under Ranjit Singh and his heirs, annexed by the East India Company on 29 March 1849; OHM maps nothing there after 1805.',
  },
  {
    name: 'Company Raj',
    like: { name: 'Mughal Empire', start: '1793' },
    start: '1849-03-29',
    end: '1858-08-02',
    clip: [70, 28.8, 80.5, 37],
    why: 'The annexed Punjab, which OHM adds to British India only in 1858.',
  },
];

/** The label-point rule keeps a small country at most this long; the ground rule, AUTO_GAP_YEARS. */
const MAX_GAP_YEARS = 3;
/** A stretch with nobody mapped, between two who are, is filled when it is no longer than this. */
const AUTO_GAP_YEARS = 5;
/** A country whose ground is orphaned to this share is itself kept on; otherwise its ground is carried. */
const WHOLE_SHARE = 0.9;
/** The grid the ground is compared on. */
const GRID = 0.5;
const COLS = 360 / GRID;
const ROWS = 180 / GRID;

const waysOf = (row: PolityRow): number[] => {
  let acc = 0;
  return row[6].map((d) => (acc += d));
};

/** Whether a point is inside a country: ray casting over its boundary ways. */
function contains(ways: number[], coarse: number[][], lon: number, lat: number): boolean {
  let inside = false;
  for (const w of ways) {
    const c = coarse[w];
    if (!c) continue;
    for (let k = 0; k + 3 < c.length; k += 2) {
      const x1 = c[k]!;
      const y1 = c[k + 1]!;
      const x2 = c[k + 2]!;
      const y2 = c[k + 3]!;
      if (Math.abs(x2 - x1) > 180) continue;
      if (y1 > lat !== y2 > lat && lon < x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1))
        inside = !inside;
    }
  }
  return inside;
}

/** "1941" → "1941-01-01": the first day a date prefix covers. */
const full = (d: string) => (d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d);
const yearsBetween = (a: string, b: string) =>
  (Date.parse(`${full(b)}T00:00:00Z`) - Date.parse(`${full(a)}T00:00:00Z`)) / (365.25 * 86_400_000);
/** In force on a day, as the map decides it. */
const activeOn = (r: PolityRow, day: string) => r[1] <= day && (!r[2] || r[2] > day);

export interface PatchResult {
  /** One line per change to the countries (appended to the index's `patches`). */
  log: string[];
  /** Ground carried (the index's `carried`, rebuilt on every run), and why. */
  carried: PolityRow[];
  carriedNotes: string[];
}

/**
 * Applies the corrections in place. Running it twice changes nothing more. `isLand` tells land
 * from sea (ground at sea is nobody's to miss).
 */
export function patchPolities(
  rows: PolityRow[],
  coarse: number[][],
  isLand: LandTest,
): PatchResult {
  const log: string[] = [];
  for (const drop of DROPS)
    for (let i = rows.length - 1; i >= 0; i--)
      if (drop.name.test(rows[i]![0])) {
        log.push(`${rows[i]![0]} (from ${rows[i]![1]}): removed. ${drop.why}`);
        rows.splice(i, 1);
      }
  for (const fix of NAME_FIXES)
    for (const row of rows)
      if (row[0] === fix.name && row[3] === fix.wikidata) {
        log.push(`${fix.name} (from ${row[1]}): named ${fix.to}. ${fix.why}`);
        row[0] = fix.to;
      }
  /** Ends set by hand: the gap rules leave them alone. */
  const settled = new Set<PolityRow>();
  for (const fix of DATE_FIXES) {
    const row = rows.find(
      (r) => r[0] === fix.name && (r[1] === fix.start || r[1] === fix.set.start),
    );
    if (!row) continue;
    if (fix.set.end !== undefined) settled.add(row);
    if (fix.set.start && row[1] !== fix.set.start) {
      log.push(`${fix.name}: starts ${fix.set.start} (OHM: ${row[1]}). ${fix.why}`);
      row[1] = fix.set.start;
    }
    if (fix.set.end !== undefined && row[2] !== fix.set.end) {
      log.push(
        `${fix.name} (from ${row[1]}): ${fix.set.end ? `ends ${fix.set.end}` : 'has no end'} (OHM: ${row[2] ?? 'open'}). ${fix.why}`,
      );
      row[2] = fix.set.end;
    }
  }
  for (const add of ADDITIONS) {
    if (rows.some((r) => r[0] === add.name && r[1] === add.start)) continue;
    const like = rows.find((r) => r[0] === add.like.name && r[1] === add.like.start);
    if (!like) {
      console.warn(`  ! ${add.name}: no "${add.like.name}" from ${add.like.start} to copy`);
      continue;
    }
    rows.push([add.name, add.start, add.end, like[3], like[4], like[5], [...like[6]], like[7]]);
    log.push(`${add.name} added for ${add.start} to ${add.end}. ${add.why}`);
  }

  // Shapes, and the land cells each covers.
  const ringsOf = new Map<PolityRow, number[][]>();
  const rings = (row: PolityRow): number[][] => {
    let r = ringsOf.get(row);
    if (!r) {
      const lines = waysOf(row).map((w) => coarse[w]);
      r = stitchOrder(lines)
        .map((steps) => ringFrom(steps, (i) => lines[i]!))
        .filter((ring) => ring.length >= 8)
        .map(unwrapRing)
        .filter((x): x is number[] => !!x);
      ringsOf.set(row, r);
    }
    return r;
  };
  const landCell = new Map<number, boolean>();
  const onLand = (cell: number) => {
    let v = landCell.get(cell);
    if (v === undefined) {
      v = isLand(((cell % COLS) + 0.5) * GRID - 180, (Math.floor(cell / COLS) + 0.5) * GRID - 90);
      landCell.set(cell, v);
    }
    return v;
  };
  const cellsOf = (row: PolityRow, clip?: Box): number[] => {
    const crossings = new Map<number, number[]>();
    for (const ring of rings(row))
      for (let k = 0; k + 3 < ring.length; k += 2) {
        const [x1, y1, x2, y2] = [ring[k]!, ring[k + 1]!, ring[k + 2]!, ring[k + 3]!];
        if (y1 === y2) continue;
        const lo = Math.min(y1, y2);
        const hi = Math.max(y1, y2);
        const from = Math.max(0, Math.ceil((lo + 90) / GRID - 0.5));
        const to = Math.min(ROWS - 1, Math.floor((hi + 90) / GRID - 0.5));
        for (let r = from; r <= to; r++) {
          const y = (r + 0.5) * GRID - 90;
          if (y < lo || y >= hi) continue;
          let list = crossings.get(r);
          if (!list) crossings.set(r, (list = []));
          list.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
        }
      }
    const out: number[] = [];
    for (const [r, xs] of crossings) {
      xs.sort((a, b) => a - b);
      const lat = (r + 0.5) * GRID - 90;
      if (clip && (lat < clip[1] || lat > clip[3])) continue;
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (
          let c = Math.ceil((xs[k]! + 180) / GRID - 0.5);
          c <= Math.floor((xs[k + 1]! + 180) / GRID - 0.5);
          c++
        ) {
          const col = ((c % COLS) + COLS) % COLS;
          const lon = (col + 0.5) * GRID - 180;
          if (clip && (lon < clip[0] || lon > clip[2])) continue;
          const cell = r * COLS + col;
          if (onLand(cell)) out.push(cell);
        }
    }
    return out;
  };

  // A label set where the country is, for those that cross the antimeridian (the build's mean
  // of longitudes puts Fiji in the Atlantic): where another version of the same country has
  // its label, if that is inside this one; otherwise the middle of its largest piece.
  const inRing = (ring: number[], x: number, y: number) => {
    let inside = false;
    for (let k = 0; k + 3 < ring.length; k += 2) {
      const [x1, y1, x2, y2] = [ring[k]!, ring[k + 1]!, ring[k + 2]!, ring[k + 3]!];
      if (y1 > y !== y2 > y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) inside = !inside;
    }
    return inside;
  };
  const wide = (row: PolityRow) => row[5][2] - row[5][0] >= 300;
  for (const row of rows) {
    if (!wide(row)) continue;
    const mine = rings(row);
    if (!mine.length) continue;
    const within = (lon: number, lat: number) =>
      mine.some((ring) => [0, 360, -360].some((t) => inRing(ring, lon + t, lat)));
    if (within(row[4][0], row[4][1])) continue;
    const twin = rows.find((r) => r[0] === row[0] && !wide(r) && within(r[4][0], r[4][1]));
    let at: [number, number];
    if (twin) at = twin[4];
    else {
      const area = (ring: number[]) => {
        let a = 0;
        for (let k = 0; k + 3 < ring.length; k += 2)
          a += ring[k]! * ring[k + 3]! - ring[k + 2]! * ring[k + 1]!;
        return Math.abs(a);
      };
      const largest = mine.reduce((best, ring) => (area(ring) > area(best) ? ring : best));
      let [sx, sy] = [0, 0];
      for (let k = 0; k < largest.length; k += 2) {
        sx += largest[k]!;
        sy += largest[k + 1]!;
      }
      const n = largest.length / 2;
      at = [
        Math.round((((((sx / n + 180) % 360) + 360) % 360) - 180) * 10) / 10,
        Math.round((sy / n) * 10) / 10,
      ];
    }
    if (at[0] === row[4][0] && at[1] === row[4][1]) continue;
    log.push(
      `${row[0]} (from ${row[1]}): label moved to ${at[1]}, ${at[0]} (it crosses 180°; the mean of its outline, ${row[4][1]}, ${row[4][0]}, is outside it).`,
    );
    row[4] = at;
  }

  // Small countries: one ends, nothing covers the point its name sits on, and something does
  // within a few years. Only where that point is inside the country itself.
  {
    const ways = new Map(rows.map((r) => [r, waysOf(r)]));
    const inBox = (r: PolityRow, lon: number, lat: number) =>
      lon >= r[5][0] && lon <= r[5][2] && lat >= r[5][1] && lat <= r[5][3];
    const covers = (r: PolityRow, lon: number, lat: number) =>
      inBox(r, lon, lat) && contains(ways.get(r)!, coarse, lon, lat);
    const year = (iso: string) => Number(iso.slice(0, 4));
    for (let pass = 0, changed = true; changed && pass < 8; pass++) {
      changed = false;
      for (const row of rows) {
        const end = row[2];
        if (!end || (row[7] ?? 2) !== 2 || end < '1800' || settled.has(row)) continue;
        const [lon, lat] = row[4];
        if (!covers(row, lon, lat)) continue;
        if (rows.some((q) => q !== row && activeOn(q, end) && covers(q, lon, lat))) continue;
        const next = rows
          .filter(
            (q) =>
              q !== row &&
              q[1] > end &&
              year(q[1]) - year(end) <= MAX_GAP_YEARS &&
              covers(q, lon, lat),
          )
          .sort((a, b) => a[1].localeCompare(b[1]))[0];
        if (!next) continue;
        log.push(
          `${row[0]} (from ${row[1]}): kept until ${next[1]}, when ${next[0]} begins (OHM ends it ${end} with nothing in its place).`,
        );
        row[2] = next[1];
        changed = true;
      }
    }
  }

  // Ground carried by hand: counted as covered in what follows.
  const carried: PolityRow[] = [];
  const carriedNotes: string[] = [];
  for (const c of CARRIED) {
    const like = rows.find((r) => r[0] === c.like.name && r[1] === c.like.start);
    if (!like) {
      console.warn(`  ! carried ${c.name}: no "${c.like.name}" from ${c.like.start} to copy`);
      continue;
    }
    const row: PolityRow = [c.name, c.start, c.end, like[3], like[4], like[5], [...like[6]], 2];
    if (c.clip) row[8] = c.clip;
    carried.push(row);
    carriedNotes.push(
      `${c.name}, ${c.start} to ${c.end ?? 'now'}${c.clip ? ` (within ${c.clip.join(', ')})` : ''}: drawn with the outline of ${c.like.name} (${c.like.start}). ${c.why}`,
    );
  }

  // The ground rule. Who covers each land cell, and when.
  const cells = new Map<PolityRow, number[]>();
  const cover = new Map<number, PolityRow[]>();
  const index = (row: PolityRow, clip?: Box) => {
    const list = cellsOf(row, clip);
    cells.set(row, list);
    for (const cell of list) {
      const who = cover.get(cell);
      if (who) who.push(row);
      else cover.set(cell, [row]);
    }
  };
  for (const row of rows) if ((row[2] ?? '9999') >= '1800') index(row);
  for (const row of carried) index(row, row[8]);

  /** For a country that has ended: its cells left to nobody, by whoever is next to hold them. */
  const orphans = (row: PolityRow): Map<PolityRow, number[]> => {
    const out = new Map<PolityRow, number[]>();
    const day = full(row[2]!);
    for (const cell of cells.get(row) ?? []) {
      const others = cover.get(cell)!.filter((q) => q !== row);
      if (others.some((q) => activeOn(q, day))) continue;
      let next: PolityRow | null = null;
      for (const q of others)
        if (full(q[1]) > day && (!next || full(q[1]) < full(next[1]))) next = q;
      if (!next || yearsBetween(day, next[1]) > AUTO_GAP_YEARS) continue;
      const list = out.get(next);
      if (list) list.push(cell);
      else out.set(next, [cell]);
    }
    return out;
  };
  const ended = () =>
    rows.filter((r) => r[2] && full(r[2]) >= '1800-01-01' && (cells.get(r)?.length ?? 0) > 0);

  // A country orphaned whole is kept on until the first of its successors begins.
  for (let pass = 0, changed = true; changed && pass < 8; pass++) {
    changed = false;
    for (const row of ended()) {
      const links = orphans(row);
      let lost = 0;
      for (const list of links.values()) lost += list.length;
      if (!lost || lost < WHOLE_SHARE * cells.get(row)!.length || settled.has(row)) continue;
      const first = [...links.keys()].sort((a, b) => full(a[1]).localeCompare(full(b[1])))[0]!;
      if (full(first[1]) <= full(row[2]!)) continue;
      log.push(
        `${row[0]} (from ${row[1]}): kept until ${first[1]}, when ${first[0]} begins (OHM ends it ${row[2]} with nothing on its ground).`,
      );
      row[2] = first[1];
      changed = true;
    }
  }
  // What is still orphaned is carried: the next holder's shape, from the day the last one ended.
  const seen = new Set<string>();
  for (const row of ended())
    for (const [next, list] of orphans(row)) {
      let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const cell of list) {
        const lon = ((cell % COLS) + 0.5) * GRID - 180;
        const lat = (Math.floor(cell / COLS) + 0.5) * GRID - 90;
        w = Math.min(w, lon);
        e = Math.max(e, lon);
        s = Math.min(s, lat);
        n = Math.max(n, lat);
      }
      const pad = GRID * 0.75;
      const clip: Box = [w - pad, s - pad, e + pad, n + pad];
      const key = `${next[0]}|${next[1]}|${row[2]}|${clip.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      carried.push([
        next[0],
        row[2]!,
        next[1],
        next[3],
        next[4],
        next[5],
        [...next[6]],
        next[7] ?? 2,
        clip,
      ]);
      carriedNotes.push(
        `${next[0]}, ${row[2]} to ${next[1]} (within ${clip.map((v) => Math.round(v * 10) / 10).join(', ')}): its ground after ${row[0]} ended, which OHM leaves to nobody until then.`,
      );
    }
  rows.sort((a, b) => a[1].localeCompare(b[1]));
  carried.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  return { log, carried, carriedNotes };
}
