/**
 * Place names for the globe, from Natural Earth (public domain): cities, oceans and seas, lakes,
 * rivers, mountain ranges and peaks, deserts and other landforms — each with the web zoom level
 * from which Natural Earth suggests labelling it, and the point its label goes on. Shapes (river
 * courses, coastlines of seas and lakes, outlines of deserts and ranges) are kept separately for
 * highlighting a place.
 *
 *   pnpm data:places                  (downloads Natural Earth at the pinned commit)
 *   NE_DIR=/path/to/geojson pnpm data:places
 *
 * Output (committed; public domain):
 *   apps/web/public/data/places/names.json  — { v, places: [[id, name, lat, lon, minZoom, kind, alt?]] }
 *     (alt: another name it goes by — "Nyanza" for Lake Victoria, "Amazon" for the Amazonas)
 *   apps/web/public/data/places/shapes.json — { id: lines or rings } (rivers: every reach)
 *
 * Label points: a city's own point; a peak's summit; for seas, lakes and regions the point
 * farthest inside the shape (so "Gulf of Mexico" sits in the gulf, not on a centroid ashore);
 * for rivers the middle of their longest reaches, one point per ~800 km of river.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simplifyLine, type LonLat } from '../packages/shared/src/geo';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../apps/web/public/data/places');
// The commit build-geodata.ts uses.
const NE_COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19';
const NE_RAW = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson`;

type Ring = LonLat[];
type Geometry =
  | { type: 'Point'; coordinates: LonLat }
  | { type: 'LineString'; coordinates: LonLat[] }
  | { type: 'MultiLineString'; coordinates: LonLat[][] }
  | { type: 'Polygon'; coordinates: Ring[] }
  | { type: 'MultiPolygon'; coordinates: Ring[][] };
interface Feature {
  properties: Record<string, unknown>;
  geometry: Geometry | null;
}

async function load(name: string): Promise<Feature[]> {
  const local = process.env.NE_DIR;
  const text = local
    ? await readFile(path.join(local, name), 'utf8')
    : await fetch(`${NE_RAW}/${name}`).then((r) => {
        if (!r.ok) throw new Error(`Download failed for ${name}: ${r.status}`);
        return r.text();
      });
  return (JSON.parse(text) as { features: Feature[] }).features;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() && v !== '-99' ? v.trim() : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** Upper- or lower-case field names (Natural Earth mixes both). */
const prop = (f: Feature, key: string) => f.properties[key] ?? f.properties[key.toUpperCase()];
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Natural Earth's label zoom, else one from its rank (Lake Victoria has no label zoom). */
const zoomOf = (f: Feature, field: string) => {
  const z = num(prop(f, field));
  if (z !== null) return z;
  const rank = num(prop(f, 'scalerank'));
  return rank === null ? null : Math.round((2 + rank * 0.6) * 10) / 10;
};

/* ------------------------------------------------------------------ geometry */

const polygonsOf = (g: Geometry | null): Ring[][] =>
  !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const linesOf = (g: Geometry | null): LonLat[][] =>
  !g
    ? []
    : g.type === 'LineString'
      ? [g.coordinates]
      : g.type === 'MultiLineString'
        ? g.coordinates
        : [];

function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += (ring[j]![0] - ring[i]![0]) * (ring[j]![1] + ring[i]![1]);
  return Math.abs(a / 2);
}

function insideRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentDistSq(px: number, py: number, a: LonLat, b: LonLat): number {
  let [x, y] = a;
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) [x, y] = b;
    else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

/** Distance to the polygon's edge: positive inside, negative outside. */
function signedDistance(x: number, y: number, polygon: Ring[]): number {
  let inside = false;
  let min = Infinity;
  for (const ring of polygon) {
    if (insideRing(x, y, ring)) inside = !inside;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
      min = Math.min(min, segmentDistSq(x, y, ring[i]!, ring[j]!));
  }
  return (inside ? 1 : -1) * Math.sqrt(min);
}

/**
 * The point farthest inside a polygon (its "pole of inaccessibility"), found by refining a grid
 * of cells: always within the shape, unlike a centroid, which falls ashore for a gulf.
 */
export function labelPoint(polygon: Ring[], precision = 0.05): LonLat {
  const outer = polygon[0]!;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of outer) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const size = Math.min(maxX - minX, maxY - minY);
  if (size === 0) return [minX, minY];
  type Cell = { x: number; y: number; h: number; d: number; max: number };
  const cell = (x: number, y: number, h: number): Cell => {
    const d = signedDistance(x, y, polygon);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  const queue: Cell[] = [];
  const h0 = size / 2;
  for (let x = minX; x < maxX; x += size)
    for (let y = minY; y < maxY; y += size) queue.push(cell(x + h0, y + h0, h0));
  let best = cell((minX + maxX) / 2, (minY + maxY) / 2, 0);
  for (let guard = 0; queue.length && guard < 20_000; guard++) {
    queue.sort((a, b) => a.max - b.max);
    const c = queue.pop()!;
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    const h = c.h / 2;
    queue.push(cell(c.x - h, c.y - h, h), cell(c.x + h, c.y - h, h));
    queue.push(cell(c.x - h, c.y + h, h), cell(c.x + h, c.y + h, h));
  }
  return [best.x, best.y];
}

/** The largest part of a (multi)polygon. */
function largest(polys: Ring[][]): Ring[] | null {
  let best: Ring[] | null = null;
  let area = -1;
  for (const p of polys) {
    const a = p[0] ? ringArea(p[0]) : 0;
    if (a > area) {
      area = a;
      best = p;
    }
  }
  return best;
}

const KM_PER_DEG = 111.2;
function lineLengthKm(line: LonLat[]): number {
  let km = 0;
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1]!;
    const [x1, y1] = line[i]!;
    const cos = Math.cos(((y0 + y1) / 2) * (Math.PI / 180));
    km += Math.hypot((x1 - x0) * cos, y1 - y0) * KM_PER_DEG;
  }
  return km;
}
/** The point halfway along a line. */
function midpoint(line: LonLat[]): LonLat {
  const half = lineLengthKm(line) / 2;
  let km = 0;
  for (let i = 1; i < line.length; i++) {
    const seg = lineLengthKm([line[i - 1]!, line[i]!]);
    if (km + seg >= half) {
      const t = seg ? (half - km) / seg : 0;
      const [x0, y0] = line[i - 1]!;
      const [x1, y1] = line[i]!;
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }
    km += seg;
  }
  return line[Math.floor(line.length / 2)]!;
}
const distanceKm = (a: LonLat, b: LonLat) => lineLengthKm([a, b]);

const simplifyRing = (ring: Ring, tol: number): Ring | null => {
  const s = simplifyLine(ring, tol).map(([x, y]) => [r3(x), r3(y)] as LonLat);
  return s.length >= 4 ? s : null;
};
const simplifyPath = (line: LonLat[], tol: number): LonLat[] | null => {
  const s = simplifyLine(line, tol).map(([x, y]) => [r3(x), r3(y)] as LonLat);
  return s.length >= 2 ? s : null;
};

/* ------------------------------------------------------------------ kinds */

export type PlaceKindCode = 'C' | 'c' | 'o' | 's' | 'l' | 'r' | 'm' | 'p' | 'd' | 'f' | 'i';

const MARINE: Record<string, PlaceKindCode> = {
  ocean: 'o',
  sea: 's',
  gulf: 's',
  bay: 's',
  strait: 's',
  sound: 's',
  channel: 's',
  fjord: 's',
  lagoon: 's',
  inlet: 's',
  generic: 's',
};
const REGION: Record<string, PlaceKindCode> = {
  'Range/mtn': 'm',
  Desert: 'd',
  Plateau: 'f',
  Plain: 'f',
  Basin: 'f',
  Valley: 'f',
  Lowland: 'f',
  Tundra: 'f',
  Wetlands: 'f',
  Delta: 'f',
  Foothills: 'f',
  Gorge: 'f',
  Depression: 'f',
  Geoarea: 'f',
  Coast: 'f',
  Peninsula: 'f',
  'Pen/cape': 'f',
  Isthmus: 'f',
  Island: 'i',
  'Island group': 'i',
};

/* ------------------------------------------------------------------ build */

type Entry = [
  id: string,
  name: string,
  lat: number,
  lon: number,
  minZoom: number,
  kind: PlaceKindCode,
  alt?: string,
];

/** The name to show and, when different, the other one it goes by (for search). */
const names = (...candidates: (string | null)[]): [string, string | undefined] | null => {
  const [first, ...rest] = candidates.filter((c): c is string => !!c);
  if (!first) return null;
  return [first, rest.find((r) => r.toLowerCase() !== first.toLowerCase())];
};
const withAlt = (e: Entry, alt: string | undefined): Entry => (alt ? [...e, alt] : e);

interface River {
  name: string;
  alt: string | undefined;
  zoom: number;
  reaches: LonLat[][];
  /** Reaches through lakes and reservoirs: part of the course, never labelled. */
  lake: Set<LonLat[]>;
}

async function main() {
  const places: Entry[] = [];
  const shapes: Record<string, LonLat[][]> = {};
  const counts: Record<string, number> = {};
  const add = (e: Entry) => {
    places.push(e);
    counts[e[5]] = (counts[e[5]] ?? 0) + 1;
  };
  let n = 0;
  const nextId = (kind: string) => `${kind}${(n++).toString(36)}`;

  // Cities: capitals and populated places (no scientific or meteorological stations).
  for (const f of await load('ne_10m_populated_places_simple.geojson')) {
    const cls = str(prop(f, 'featurecla')) ?? '';
    const named = names(str(prop(f, 'name')), str(prop(f, 'namealt')));
    const zoom = num(prop(f, 'min_zoom'));
    const lat = num(prop(f, 'latitude'));
    const lon = num(prop(f, 'longitude'));
    if (!named || zoom === null || lat === null || lon === null) continue;
    if (!/^(Admin-|Populated place)/i.test(cls)) continue;
    const kind: PlaceKindCode = /^Admin-0 capital/i.test(cls) ? 'C' : 'c';
    add(withAlt([nextId(kind), named[0], r3(lat), r3(lon), zoom, kind], named[1]));
  }

  // Peaks.
  for (const f of await load('ne_10m_geography_regions_elevation_points.geojson')) {
    if (str(prop(f, 'featurecla')) !== 'mountain') continue;
    const named = names(str(prop(f, 'name_en')), str(prop(f, 'name')));
    const zoom = num(prop(f, 'min_zoom'));
    const g = f.geometry;
    if (!named || zoom === null || g?.type !== 'Point') continue;
    const [lon, lat] = g.coordinates;
    add(withAlt([nextId('p'), named[0], r3(lat), r3(lon), zoom, 'p'], named[1]));
  }

  // Areas: oceans and seas, lakes, ranges, deserts and other landforms.
  const area = (
    f: Feature,
    kind: PlaceKindCode,
    [name, alt]: [string, string | undefined],
    zoom: number,
    tol: number,
  ) => {
    const polys = polygonsOf(f.geometry);
    const main = largest(polys);
    if (!main) return;
    const simple = main.map((r) => simplifyRing(r, tol)).filter((r): r is Ring => !!r);
    const [lon, lat] = labelPoint(simple.length ? simple : main, tol);
    const id = nextId(kind);
    add(withAlt([id, name, r3(lat), r3(lon), zoom, kind], alt));
    // Outlines of every part (outer rings), for highlighting.
    shapes[id] = polys
      .map((p) => (p[0] ? simplifyRing(p[0], tol) : null))
      .filter((r): r is Ring => !!r);
  };
  // Seas and lakes: the everyday name first ("Lake Victoria", not its name_en "Nyanza").
  for (const f of await load('ne_10m_geography_marine_polys.geojson')) {
    const kind = MARINE[str(prop(f, 'featurecla')) ?? ''];
    const named = names(str(prop(f, 'name')), str(prop(f, 'name_en')));
    const zoom = zoomOf(f, 'min_label');
    if (!kind || !named || zoom === null) continue;
    area(f, kind, named, zoom, kind === 'o' ? 0.2 : 0.03);
  }
  for (const f of await load('ne_50m_lakes.geojson')) {
    const named = names(str(prop(f, 'name')), str(prop(f, 'name_en')));
    const zoom = zoomOf(f, 'min_label');
    if (!named || zoom === null) continue;
    area(f, 'l', named, zoom, 0.02);
  }
  // Landforms: English first (NAME is often the local one, "PENÍNSULA IBÉRICA").
  for (const f of await load('ne_10m_geography_regions_polys.geojson')) {
    const kind = REGION[str(prop(f, 'FEATURECLA')) ?? ''];
    const named = names(str(prop(f, 'NAME_EN')), str(prop(f, 'NAME')));
    const zoom = zoomOf(f, 'MIN_LABEL');
    if (!kind || !named || zoom === null) continue;
    area(f, kind, named, zoom, 0.05);
  }

  // Rivers: Natural Earth numbers a river's stretches separately (the Mississippi twice, the
  // Yangtze three times) and carries it through its lakes as "lake centrelines" (the Nile through
  // Lake Nasser). Stretches with one name that touch are one river: one shape, labels along its
  // longest reaches.
  const byName = new Map<string, River>();
  for (const f of await load('ne_10m_rivers_lake_centerlines.geojson')) {
    const cls = str(prop(f, 'featurecla'));
    if (cls !== 'River' && cls !== 'Lake Centerline') continue;
    const named = names(str(prop(f, 'name_en')), str(prop(f, 'name')), str(prop(f, 'name_alt')));
    if (!named) continue;
    const zoom = num(prop(f, 'min_label')) ?? 4 + (num(prop(f, 'scalerank')) ?? 6) * 0.6;
    const r: River = byName.get(named[0]) ?? {
      name: named[0],
      alt: named[1],
      zoom,
      reaches: [],
      lake: new Set(),
    };
    if (cls === 'River') r.zoom = Math.min(r.zoom, zoom);
    r.alt ??= named[1];
    for (const l of linesOf(f.geometry).filter((x) => x.length >= 2)) {
      r.reaches.push(l);
      if (cls !== 'River') r.lake.add(l);
    }
    byName.set(named[0], r);
  }
  const rivers: River[] = [];
  for (const r of byName.values()) {
    // Union of reaches whose ends are within 60 km of each other.
    const { reaches } = r;
    const parent = reaches.map((_, i) => i);
    const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
    const ends = reaches.map((l) => [l[0]!, l[l.length - 1]!]);
    for (let i = 0; i < reaches.length; i++)
      for (let j = i + 1; j < reaches.length; j++)
        if (ends[i]!.some((a) => ends[j]!.some((b) => distanceKm(a, b) < 60)))
          parent[root(i)] = root(j);
    const groups = new Map<number, LonLat[][]>();
    reaches.forEach((l, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), l]));
    for (const g of groups.values())
      if (g.some((l) => !r.lake.has(l))) rivers.push({ ...r, reaches: g });
  }
  for (const r of rivers) {
    const id = nextId('r');
    const reaches = r.reaches.map((l) => simplifyPath(l, 0.01)).filter((l): l is LonLat[] => !!l);
    if (!reaches.length) continue;
    shapes[id] = reaches;
    // One label per ~800 km: the middles of the longest reaches, far enough apart.
    const points: LonLat[] = [];
    const labelled = r.reaches.filter((l) => !r.lake.has(l));
    for (const reach of labelled.sort((a, b) => lineLengthKm(b) - lineLengthKm(a))) {
      if (lineLengthKm(reach) < 60 && points.length) break;
      const mid = midpoint(reach);
      if (points.every((p) => distanceKm(p, mid) > 800)) points.push(mid);
      if (points.length >= 6) break;
    }
    points.forEach(([lon, lat], i) =>
      add(
        withAlt(
          [i ? `${id}.${i}` : id, r.name, r3(lat), r3(lon), r.zoom + (i ? 1 : 0), 'r'],
          r.alt,
        ),
      ),
    );
  }

  places.sort((a, b) => a[4] - b[4] || a[1].localeCompare(b[1]));
  await mkdir(OUT, { recursive: true });
  await writeFile(
    path.join(OUT, 'names.json'),
    JSON.stringify({
      v: 1,
      source: 'Natural Earth (public domain), ne_10m/ne_50m at ' + NE_COMMIT.slice(0, 7),
      places,
    }),
  );
  await writeFile(path.join(OUT, 'shapes.json'), JSON.stringify(shapes));
  console.log(`${places.length} place names, ${Object.keys(shapes).length} shapes:`, counts);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
  await main();
