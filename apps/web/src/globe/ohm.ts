/**
 * Dated borders from OpenHistoricalMap (CC0), built by `pnpm data:ohm`
 * (scripts/build-ohm-borders.ts) into apps/web/public/data/ohm/.
 *
 * Each polity (country, colony, occupation regime …) has a start/end date and the ways that
 * bound it. Neighbouring OHM boundaries share way objects, so on a given day a way bounded by
 * two active polities is a land border between them. A way bounded by only one is a coastline
 * (or faces territory OHM has not mapped) and is not drawn — imagery shows coasts far better
 * than boundary data, and drawing them is what made historical borders look "off the land".
 */
import type { BorderLineLike } from './GeometryLayers';

export interface OhmPolity {
  name: string;
  /** ISO date prefix ("1941", "1941-04", "1941-04-14"); compares correctly as a string. */
  start: string;
  end: string | null;
  wikidata: string | null;
  label: [number, number];
  bbox: [number, number, number, number];
  ways: number[];
  /** 2 = state; 3 = occupation regime or dependent territory (General Government, …). */
  tier: 2 | 3;
  /** Carried ground only: the part of the shape that counts (west, south, east, north). */
  clip?: [number, number, number, number];
}

export interface OhmIndex {
  retrieved: string;
  tileDeg: number;
  tiles: Set<string>;
  polities: OhmPolity[];
  /**
   * Ground the build's corrections carry where OpenHistoricalMap maps nobody
   * (scripts/lib/ohm-patches.ts): painted by the Territories layer under the countries, with
   * no border or label of its own.
   */
  carried: OhmPolity[];
}

type Row = [
  string,
  string,
  string | null,
  string | null,
  [number, number],
  [number, number, number, number],
  number[],
  (2 | 3)?,
  [number, number, number, number]?,
];

export function parseOhmIndex(json: {
  retrieved: string;
  tileDeg: number;
  tiles: string[];
  polities: Row[];
  carried?: Row[];
}): OhmIndex {
  const row = ([name, start, end, wikidata, label, bbox, deltas, tier, clip]: Row): OhmPolity => {
    let acc = 0;
    const ways = deltas.map((d) => (acc += d));
    return {
      name,
      start,
      end,
      wikidata,
      label,
      bbox,
      ways,
      tier: tier ?? 2,
      ...(clip ? { clip } : {}),
    };
  };
  return {
    retrieved: json.retrieved,
    tileDeg: json.tileDeg,
    tiles: new Set(json.tiles),
    polities: json.polities.map(row),
    carried: (json.carried ?? []).map(row),
  };
}

/** Polities in force on `day` ("YYYY-MM-DD"): start ≤ day < end. */
export function activeOn(polities: OhmPolity[], day: string): OhmPolity[] {
  return polities.filter((p) => p.start <= day && (!p.end || p.end > day));
}

/** Distance (degrees, ~5 km) at which two separately drawn boundary ways are one border. */
const ADJACENT_DEG = 0.05;
const GRID_DEG = 0.25;

/**
 * Borders to draw on a day, from the ways bounding the polities in force:
 *  - a way shared by two of them, unless it lies at sea (a maritime limit);
 *  - a way bounding only one of them, if it lies inland: the neighbour is missing from OHM
 *    (e.g. occupied Poland's General Government) or mapped its own copy of the line. Where
 *    both neighbours mapped separate copies, one copy is kept.
 * `classes` (from the build: '2' inland, '1' near the coast, '0' at sea) keeps coastlines and
 * maritime limits off the map. Without it, only shared ways are drawn.
 */
export function landBorders(active: OhmPolity[], coarse?: number[][], classes?: string): number[] {
  const owners = new Map<number, number[]>();
  active.forEach((p, i) => {
    for (const w of p.ways) {
      const list = owners.get(w);
      if (list) list.push(i);
      else owners.set(w, [i]);
    }
  });
  const shared: number[] = [];
  const inland: number[] = [];
  for (const [w, o] of owners) {
    const where = classes?.[w];
    if (o.length >= 2) {
      if (where !== '0') shared.push(w);
    } else if (where === '2') inland.push(w);
  }
  const kept = coarse ? withoutDuplicates(inland, shared, owners, coarse) : inland;
  return [...shared, ...kept].sort((a, b) => a - b);
}

/**
 * Drops single-owner ways that duplicate a border already drawn: one running alongside a
 * shared way, or the higher-numbered of two copies mapped by the two neighbours.
 */
function withoutDuplicates(
  inland: number[],
  shared: number[],
  owners: Map<number, number[]>,
  coarse: number[][],
): number[] {
  const sharedSet = new Set(shared);
  const grid = new Map<string, Array<{ w: number; k: number }>>();
  const cell = (x: number, y: number) => `${Math.floor(x / GRID_DEG)},${Math.floor(y / GRID_DEG)}`;
  for (const w of [...shared, ...inland]) {
    const c = coarse[w];
    if (!c) continue;
    for (let k = 0; k + 3 < c.length; k += 2) {
      const [x1, y1, x2, y2] = [c[k]!, c[k + 1]!, c[k + 2]!, c[k + 3]!];
      const gx0 = Math.floor((Math.min(x1, x2) - ADJACENT_DEG) / GRID_DEG);
      const gx1 = Math.floor((Math.max(x1, x2) + ADJACENT_DEG) / GRID_DEG);
      const gy0 = Math.floor((Math.min(y1, y2) - ADJACENT_DEG) / GRID_DEG);
      const gy1 = Math.floor((Math.max(y1, y2) + ADJACENT_DEG) / GRID_DEG);
      if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 400) continue; // antimeridian jump
      for (let gx = gx0; gx <= gx1; gx++)
        for (let gy = gy0; gy <= gy1; gy++) {
          const key = `${gx},${gy}`;
          const list = grid.get(key);
          if (list) list.push({ w, k });
          else grid.set(key, [{ w, k }]);
        }
    }
  }
  const out: number[] = [];
  for (const w of inland) {
    const c = coarse[w];
    if (!c || c.length < 4) continue;
    const mine = owners.get(w)!;
    // Sample the middle of the line only: its ends touch the borders it connects to, which
    // is not duplication.
    const votes = new Map<number, number>();
    const points = interiorSamples(c, 5);
    for (const [x, y] of points) {
      let best = ADJACENT_DEG;
      let partner = -1;
      for (const e of grid.get(cell(x, y)) ?? []) {
        if (e.w === w || owners.get(e.w)!.some((o) => mine.includes(o))) continue;
        const d = segmentDistance(x, y, coarse[e.w]!, e.k);
        if (d <= best) {
          best = d;
          partner = e.w;
        }
      }
      if (partner >= 0) votes.set(partner, (votes.get(partner) ?? 0) + 1);
    }
    // A duplicate runs alongside one particular line for most of its length.
    const [partner, count] = [...votes].sort((a, b) => b[1] - a[1])[0] ?? [-1, 0];
    const duplicate = count / points.length >= 0.6 && (sharedSet.has(partner) || partner < w);
    if (!duplicate) out.push(w);
  }
  return out;
}

/** `n` points evenly spaced along the line's length, excluding its two ends. */
function interiorSamples(c: number[], n: number): Array<[number, number]> {
  const lengths: number[] = [0];
  for (let k = 2; k < c.length; k += 2)
    lengths.push(
      lengths[lengths.length - 1]! + Math.hypot(c[k]! - c[k - 2]!, c[k + 1]! - c[k - 1]!),
    );
  const total = lengths[lengths.length - 1]!;
  const out: Array<[number, number]> = [];
  if (total === 0) return [[c[0]!, c[1]!]];
  let seg = 1;
  for (let i = 1; i <= n; i++) {
    const at = (total * i) / (n + 1);
    while (seg < lengths.length - 1 && lengths[seg]! < at) seg++;
    const t = (at - lengths[seg - 1]!) / (lengths[seg]! - lengths[seg - 1]! || 1);
    const k = (seg - 1) * 2;
    out.push([c[k]! + t * (c[k + 2]! - c[k]!), c[k + 1]! + t * (c[k + 3]! - c[k + 1]!)]);
  }
  return out;
}

function segmentDistance(px: number, py: number, s: number[], k: number): number {
  const x1 = s[k]!;
  const y1 = s[k + 1]!;
  const dx = s[k + 2]! - x1;
  const dy = s[k + 3]! - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Detail tiles (as named by the build) that intersect a "w,s,e,n" view box. */
export function tilesInView(bbox: string | null, index: OhmIndex): string[] {
  if (!bbox) return [];
  const [w, s, e, n] = bbox.split(',').map(Number) as [number, number, number, number];
  if (![w, s, e, n].every(Number.isFinite)) return [];
  const d = index.tileDeg;
  const cols = (from: number, to: number) => {
    const out: number[] = [];
    const a = Math.floor((from + 180) / d);
    const b = Math.floor((Math.min(to, 179.999) + 180) / d);
    for (let x = a; x <= b; x++) out.push(x);
    return out;
  };
  // A view across the antimeridian has west > east.
  const xs = w <= e ? cols(w, e) : [...cols(w, 180), ...cols(-180, e)];
  const ys: number[] = [];
  for (let y = Math.floor((s + 90) / d); y <= Math.floor((Math.min(n, 89.999) + 90) / d); y++)
    ys.push(y);
  const out: string[] = [];
  for (const x of xs) for (const y of ys) if (index.tiles.has(`${x}_${y}`)) out.push(`${x}_${y}`);
  return out;
}

/**
 * Lines to draw: detailed geometry where its tile is loaded, coarse geometry elsewhere. Drawn
 * solid: the dates are exact; the line geometry is OHM's (often traced from modern data,
 * otherwise a reconstruction — stated in the layer description and CONTENT_LICENSING.md).
 */
export function borderLines(
  borders: number[],
  coarse: number[][],
  fine: Map<number, number[]>,
  /** Only ways whose coarse extent meets this "w,s,e,n" box (null = all). */
  view: string | null = null,
): BorderLineLike[] {
  const box = view ? expand(view) : null;
  const out: BorderLineLike[] = [];
  for (const w of borders) {
    if (box && !meets(coarse[w], box)) continue;
    const flat = fine.get(w) ?? coarse[w];
    if (!flat || flat.length < 4) continue;
    const coordinates: number[][] = [];
    for (let i = 0; i < flat.length; i += 2) coordinates.push([flat[i]!, flat[i + 1]!]);
    out.push({
      properties: { certainty: 'CERTAIN' },
      geometry: { type: 'LineString', coordinates },
    });
  }
  return out;
}

/** View box grown by half its size on each side (so panning a little stays covered). */
function expand(view: string): [number, number, number, number] | null {
  const b = view.split(',').map(Number);
  if (b.length !== 4 || !b.every(Number.isFinite)) return null;
  const [w, s, e, n] = b as [number, number, number, number];
  if (w > e) return null; // across the antimeridian: draw everything
  const dx = (e - w) / 2;
  const dy = (n - s) / 2;
  return [w - dx, s - dy, e + dx, n + dy];
}

function meets(
  flat: number[] | undefined,
  [w, s, e, n]: [number, number, number, number],
): boolean {
  if (!flat) return false;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    minX = Math.min(minX, flat[i]!);
    maxX = Math.max(maxX, flat[i]!);
    minY = Math.min(minY, flat[i + 1]!);
    maxY = Math.max(maxY, flat[i + 1]!);
  }
  return maxX >= w && minX <= e && maxY >= s && minY <= n;
}

/**
 * Name labels for the active polities whose label point is in view ("w,s,e,n"; null = whole
 * globe), largest first — bbox area is a cheap size proxy.
 */
export function polityLabels(
  active: OhmPolity[],
  view: string | null = null,
): Array<{ name: string; lon: number; lat: number; area: number }> {
  const box = view?.split(',').map(Number);
  const inView = (lon: number, lat: number) => {
    if (!box || box.length !== 4 || !box.every(Number.isFinite)) return true;
    const [w, s, e, n] = box as [number, number, number, number];
    if (lat < s || lat > n) return false;
    return w <= e ? lon >= w && lon <= e : lon >= w || lon <= e;
  };
  return active
    .filter((p) => inView(p.label[0], p.label[1]))
    .map((p) => ({
      name: p.name,
      lon: p.label[0],
      lat: p.label[1],
      area: Math.max(0, p.bbox[2] - p.bbox[0]) * Math.max(0, p.bbox[3] - p.bbox[1]),
    }))
    .sort((a, b) => b.area - a.area);
}

/** Which active polity covers a point: ray casting over each candidate's boundary ways. */
export function polityAt(
  active: OhmPolity[],
  coarse: number[][],
  lon: number,
  lat: number,
): OhmPolity | null {
  let best: OhmPolity | null = null;
  let bestArea = Infinity;
  for (const p of active) {
    const [w, s, e, n] = p.bbox;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    let inside = false;
    for (const way of p.ways) {
      const c = coarse[way];
      if (!c) continue;
      for (let k = 0; k + 3 < c.length; k += 2) {
        const x1 = c[k]!;
        const y1 = c[k + 1]!;
        const x2 = c[k + 2]!;
        const y2 = c[k + 3]!;
        if (Math.abs(x2 - x1) > 180) continue; // antimeridian jump
        if (y1 > lat !== y2 > lat && lon < x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1))
          inside = !inside;
      }
    }
    // Several can match (claims, occupation regimes inside a state): the smallest wins.
    const area = (e - w) * (n - s);
    if (inside && area < bestArea) {
      best = p;
      bestArea = area;
    }
  }
  return best;
}

export interface FlagInfo {
  file: string;
  start: string | null;
  end: string | null;
  /** No recorded flag covers the day; this is the nearest one (its own dates are shown). */
  nearest: boolean;
}

type FlagRow = [string, string | null, string | null, boolean];

/**
 * The flag in use on `day`, following the flags' own dates (Wikidata qualifiers, or the years
 * in the file name):
 *  1. a dated flag covering the day — Wikidata's preferred statement first, then the most
 *     recently adopted;
 *  2. an undated flag, but only after every dated flag (typically the current flag, never shown
 *     for an earlier era it did not exist in);
 *  3. the nearest dated flag within five years, marked `nearest` so its dates are shown;
 *  4. otherwise none.
 */
export function flagFor(
  flags: FlagRow[],
  _polity: Pick<OhmPolity, 'start' | 'end'>,
  day: string,
): FlagInfo | null {
  const pick = (f: FlagRow, nearest = false): FlagInfo => ({
    file: f[0],
    start: f[1],
    end: f[2],
    nearest,
  });
  const dated = flags.filter((f) => f[1] || f[2]);
  const covers = dated.filter(([, s, e]) => (!s || s <= day) && (!e || e > day));
  if (covers.length) {
    covers.sort(
      (a, b) =>
        Number(b[3]) - Number(a[3]) ||
        (b[1] ?? '').localeCompare(a[1] ?? '') ||
        a[0].length - b[0].length,
    );
    return pick(covers[0]!);
  }
  const undated = flags.filter((f) => !f[1] && !f[2]);
  // Undated flags only after every dated flag has ended (or when nothing is dated).
  if (undated.length && dated.every(([, , e]) => !!e && e <= day))
    return pick(undated.find((f) => f[3]) ?? undated[0]!);
  const year = (d: string) => Number(d.slice(0, 4));
  const y = year(day);
  let best: FlagRow | null = null;
  let bestGap = 6;
  for (const f of dated) {
    const gap =
      f[1] && year(f[1]) > y ? year(f[1]) - y : f[2] && year(f[2]) <= y ? y - year(f[2]) + 1 : 0;
    if (gap < bestGap) {
      best = f;
      bestGap = gap;
    }
  }
  return best ? pick(best, true) : null;
}

export interface FlagSource {
  label: string | null;
  flags: FlagRow[];
  related?: string[];
}

/**
 * The flag for a polity on a day. OpenHistoricalMap often links a period of a state ("kingdom
 * of Italy under Fascist rule") rather than the state; such items rarely list flags, so when
 * the item has none in use that day, the states it is part of / replaces / follows … are tried —
 * still only a flag in use on that day — and `owner` names whose flag it is.
 */
export function flagForPolity(
  items: Record<string, FlagSource>,
  qid: string | null,
  polity: Pick<OhmPolity, 'start' | 'end'>,
  day: string,
): (FlagInfo & { owner: string | null }) | null {
  const own = qid ? items[qid] : undefined;
  const mine = own ? flagFor(own.flags, polity, day) : null;
  if (mine && !mine.nearest) return { ...mine, owner: null };
  for (const rel of own?.related ?? []) {
    const e = items[rel];
    const f = e ? flagFor(e.flags, polity, day) : null;
    if (f && !f.nearest) return { ...f, owner: e!.label ?? rel };
  }
  return mine ? { ...mine, owner: null } : null;
}

export interface PolityMatch {
  /** Version to show: the one in force on `day`, else the nearest in time. */
  polity: OhmPolity;
  /** Whole span of all versions with this identity. */
  start: string;
  end: string | null;
  activeNow: boolean;
}

/** Historical countries matching a query, one result per state (Wikidata id or name). */
export function searchPolities(
  polities: OhmPolity[],
  query: string,
  day: string,
  limit = 6,
): PolityMatch[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const groups = new Map<string, OhmPolity[]>();
  for (const p of polities) {
    if (!p.name.toLowerCase().includes(q)) continue;
    const key = p.wikidata ?? `name:${p.name}`;
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  const dayYear = Number(day.slice(0, 4));
  const matches = [...groups.values()].map((versions): PolityMatch & { score: number } => {
    const active = versions.find((p) => p.start <= day && (!p.end || p.end > day));
    const distance = (p: OhmPolity) =>
      Math.min(
        Math.abs(Number(p.start.slice(0, 4)) - dayYear),
        Math.abs(Number((p.end ?? day).slice(0, 4)) - dayYear),
      );
    const polity = active ?? [...versions].sort((a, b) => distance(a) - distance(b))[0]!;
    const start = versions.reduce((m, p) => (p.start < m ? p.start : m), versions[0]!.start);
    const end = versions.some((p) => !p.end)
      ? null
      : versions.reduce((m, p) => (p.end! > m ? p.end! : m), versions[0]!.end!);
    const name = polity.name.toLowerCase();
    const score =
      (active ? 100 : 0) + (name === q ? 50 : name.startsWith(q) ? 20 : 0) - distance(polity) / 100;
    return { polity, start, end, activeNow: !!active, score };
  });
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...m }) => m);
}

/**
 * Wikidata succession for OHM polities (succession.json, `pnpm data:succession`): for a
 * polity's Wikidata id, the other ids that are the same country, and its successors and
 * predecessors with how many steps away they are.
 */
export type Succession = Record<
  string,
  [same: string[], next: Array<[string, number]>, prev: Array<[string, number]>]
>;

/** A selected country version (CountrySelection carries these). */
export type PolityRef = Omit<OhmPolity, 'tier'>;

export type FollowResult =
  | { kind: 'keep' }
  | {
      kind: 'switch';
      polity: OhmPolity;
      how: 'same' | 'successor' | 'predecessor' | 'border' | 'territory';
    }
  | { kind: 'close' };

const isActive = (p: { start: string; end: string | null }, day: string) =>
  p.start <= day && (!p.end || p.end > day);

/** "1866" / "1866-09" / "1866-09-20" → ms (start of that period). */
const dayMs = (d: string) =>
  Date.parse(d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d);

/**
 * Short holes in the data are not the end of a country: Greece has no version between
 * 1 Jan and 10 Feb 1947, Prussia none between 20 Sep and 1 Oct 1866.
 */
const MAX_GAP_MS = 400 * 86_400_000;

function sharedWays(a: number[], b: number[]): number {
  const set = new Set(a);
  let n = 0;
  for (const w of b) if (set.has(w)) n++;
  return n;
}

const overlaps = (a: PolityRef, b: PolityRef) =>
  a.bbox[0] <= b.bbox[2] &&
  b.bbox[0] <= a.bbox[2] &&
  a.bbox[1] <= b.bbox[3] &&
  b.bbox[1] <= a.bbox[3];

/** Best continuation among candidates: covers the old label point, else shares most border. */
function pick(cands: OhmPolity[], sel: PolityRef, coarse?: number[][]): OhmPolity | null {
  if (cands.length <= 1) return cands[0] ?? null;
  const at = coarse ? polityAt(cands, coarse, sel.label[0], sel.label[1]) : null;
  if (at) return at;
  let best: OhmPolity | null = null;
  let bestScore = -1;
  for (const c of cands) {
    const score = sharedWays(sel.ways, c.ways);
    if (score > bestScore) [best, bestScore] = [c, score];
  }
  return best;
}

/**
 * Where a selected country goes when the timeline leaves the period of its selected version:
 *  1. the same country's version in force that day (border changes, Weimar ↔ Nazi Germany);
 *  2. its nearest successor (moving forward) or predecessor (moving back) that day;
 *  3. a country of the same name;
 *  4. a country sharing at least half its border (same territory, renamed, no Wikidata link);
 *  5. the country that holds its land that day (annexed, merged, or carved out of it).
 * Successors, predecessors and namesakes must overlap it — the one covers the other's label
 * point — which drops wrong-way or stray Wikidata links (Papal States → Republic of Cospaia).
 * A hole in the data (something continues it within MAX_GAP further on) keeps the selection:
 * checked after steps 1–3 for the same country, and before closing for anything; otherwise
 * it closes.
 */
export function followCountry(
  sel: PolityRef,
  all: OhmPolity[],
  succession: Succession,
  day: string,
  coarse?: number[][],
  today: string = new Date().toISOString().slice(0, 10),
): FollowResult {
  if (isActive(sel, day)) return { kind: 'keep' };
  const forward = !!sel.end && day >= sel.end;
  const at = (d: string, steps: 'strong' | 'all') =>
    continuation(sel, all, succession, d, forward, steps, coarse);
  // Dates within MAX_GAP further on where the map changes near it, nearest first.
  const target = dayMs(day);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const probes = [
    ...new Set(
      all
        .filter((p) => overlaps(p, sel))
        .map((p) => (forward ? p.start : p.end && iso(dayMs(p.end) - 86_400_000)))
        .filter(
          (d): d is string =>
            !!d &&
            (forward ? d > day && d <= today : d < day) &&
            Math.abs(dayMs(d) - target) <= MAX_GAP_MS,
        ),
    ),
  ].sort((a, b) => Math.abs(dayMs(a) - target) - Math.abs(dayMs(b) - target));
  const soon = (steps: 'strong' | 'all') => probes.some((d) => !!at(d, steps));

  const strong = at(day, 'strong');
  if (strong) return strong;
  if (soon('strong')) return { kind: 'keep' };
  const weak = at(day, 'all');
  if (weak) return weak;
  if (soon('all')) return { kind: 'keep' };
  return { kind: 'close' };
}

function continuation(
  sel: PolityRef,
  all: OhmPolity[],
  succession: Succession,
  day: string,
  forward: boolean,
  steps: 'strong' | 'all',
  coarse?: number[][],
): FollowResult | null {
  const active = activeOn(all, day);
  const entry = sel.wikidata ? succession[sel.wikidata] : undefined;
  const same = new Set([sel.wikidata, ...(entry?.[0] ?? [])].filter((q): q is string => !!q));
  const isSame = (p: OhmPolity) =>
    p.wikidata ? same.has(p.wikidata) : !sel.wikidata && p.name === sel.name;

  const sameNow = pick(active.filter(isSame), sel, coarse);
  if (sameNow) return { kind: 'switch', polity: sameNow, how: 'same' };

  const nearby = active.filter((p) => overlaps(p, sel));
  const covers = (p: PolityRef, [lon, lat]: [number, number]) =>
    !coarse || polityAt([{ ...p, tier: 2 }], coarse, lon, lat) !== null;
  const related = (p: OhmPolity) => covers(p, sel.label) || covers(sel, p.label);
  const links = (forward ? entry?.[1] : entry?.[2]) ?? [];
  for (const depth of [...new Set(links.map(([, d]) => d))].sort((a, b) => a - b)) {
    const ids = new Set(links.filter(([, d]) => d === depth).map(([q]) => q));
    const found = pick(
      nearby.filter((p) => p.wikidata && ids.has(p.wikidata) && related(p)),
      sel,
      coarse,
    );
    if (found) return { kind: 'switch', polity: found, how: forward ? 'successor' : 'predecessor' };
  }

  const named = pick(
    nearby.filter((p) => p.name === sel.name && related(p)),
    sel,
    coarse,
  );
  if (named) return { kind: 'switch', polity: named, how: 'same' };
  if (steps === 'strong') return null;

  const border = pick(
    nearby.filter(
      (p) => sel.ways.length > 0 && sharedWays(sel.ways, p.ways) * 2 >= sel.ways.length,
    ),
    sel,
    coarse,
  );
  if (border) return { kind: 'switch', polity: border, how: 'border' };
  // Only where the label point is really inside it (Prussia's 1866 point lies in Saxony).
  const holder =
    coarse && covers(sel, sel.label) ? polityAt(nearby, coarse, sel.label[0], sel.label[1]) : null;
  if (holder) return { kind: 'switch', polity: holder, how: 'territory' };
  return null;
}
