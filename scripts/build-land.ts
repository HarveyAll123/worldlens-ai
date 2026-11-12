/**
 * The land's outline for the Territories layer (apps/web/src/globe/territory.ts), which keeps
 * countries' colours on land: OpenHistoricalMap bounds a country by its waters, not its coast.
 *
 *   pnpm data:land
 *
 * Land is OpenStreetMap's coastline (scripts/lib/osm-land.ts; © OpenStreetMap contributors,
 * ODbL), which agrees with satellite imagery to a few hundred metres and has the small islands.
 * Large lakes are cut out with Natural Earth 1:10m lakes (public domain).
 *
 * Output (committed), in apps/web/public/data/land/:
 *   low.json      – the whole world, simplified (~3 km), islands under 20 km² left out: for map
 *                   tiles seen from far away.
 *   cells.json    – a grid of CELL_DEG° cells: for each, all sea, all land, or mixed.
 *   c<x>_<y>.json – a mixed cell's land in detail (~150 m), loaded when the view is close.
 * Rings are whole numbers of 1/scale degrees: the first point, then each point's difference
 * from the one before.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OSM_LAND_CREDIT, loadOsmLand, ringAreaKm2, type Ring } from './lib/osm-land';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../apps/web/public/data/land');
const NE_COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19';
const LAKES_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson/ne_10m_lakes.geojson`;

/** Cells are the map tiles of this level of the plain latitude/longitude grid (2ⁿ⁺¹ × 2ⁿ). */
const CELL_LEVEL = Number(process.env.LAND_CELL_LEVEL ?? 5);
const CELL_DEG = 180 / 2 ** CELL_LEVEL;
const COLS = 2 ** (CELL_LEVEL + 1);
const ROWS = 2 ** CELL_LEVEL;
/** Each cell's land reaches this far past its edges, so tiles on the edge are painted whole. */
const MARGIN = 0.03;
const FINE = { scale: 2000, toleranceKm: Number(process.env.LAND_TOL_KM ?? 0.12) };
const LOW = { scale: 100, toleranceDeg: 0.03, minKm2: 20 };
/** Lakes smaller than this stay coloured as the land around them. */
const LAKE_MIN_KM2 = 1000;
const LAKE_MIN_KM2_LOW = 2500;

type Rect = [west: number, south: number, east: number, north: number];

/** Sutherland–Hodgman: the part of a ring on the kept side of one vertical or horizontal line. */
function clipHalf(ring: Ring, axis: 0 | 1, at: number, keepGreater: boolean): Ring {
  const out: Ring = [];
  const inside = (p: [number, number]) => (keepGreater ? p[axis] >= at : p[axis] <= at);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const ain = inside(a);
    const bin = inside(b);
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (at - a[axis]) / (b[axis] - a[axis]);
      out.push(axis === 0 ? [at, a[1] + t * (b[1] - a[1])] : [a[0] + t * (b[0] - a[0]), at]);
    }
  }
  return out;
}

function boxOf(ring: Ring): Rect {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of ring) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

function clipRect(ring: Ring, box: Rect, [w, s, e, n]: Rect): Ring | null {
  if (box[2] < w || box[0] > e || box[3] < s || box[1] > n) return null;
  if (box[0] >= w && box[2] <= e && box[1] >= s && box[3] <= n) return ring;
  let r = ring;
  if (box[0] < w) r = clipHalf(r, 0, w, true);
  if (box[2] > e) r = clipHalf(r, 0, e, false);
  if (box[1] < s) r = clipHalf(r, 1, s, true);
  if (box[3] > n) r = clipHalf(r, 1, n, false);
  return r.length >= 3 ? r : null;
}

/** Hands every cell the rings that reach it (clipped to the cell and its margin). */
function intoCells(rings: Ring[], each: (col: number, row: number, rings: Ring[]) => void): void {
  const walk = (
    list: Array<{ ring: Ring; box: Rect }>,
    c0: number,
    r0: number,
    cols: number,
    rows: number,
  ) => {
    if (!list.length) return;
    const rect: Rect = [
      -180 + c0 * CELL_DEG - MARGIN,
      -90 + r0 * CELL_DEG - MARGIN,
      -180 + (c0 + cols) * CELL_DEG + MARGIN,
      -90 + (r0 + rows) * CELL_DEG + MARGIN,
    ];
    const inside: Array<{ ring: Ring; box: Rect }> = [];
    for (const item of list) {
      const ring = clipRect(item.ring, item.box, rect);
      if (ring) inside.push({ ring, box: ring === item.ring ? item.box : boxOf(ring) });
    }
    if (!inside.length) return;
    if (cols === 1 && rows === 1)
      return each(
        c0,
        r0,
        inside.map((i) => i.ring),
      );
    const hc = Math.max(1, cols >> 1);
    const hr = Math.max(1, rows >> 1);
    walk(inside, c0, r0, hc, hr);
    if (cols > 1) walk(inside, c0 + hc, r0, cols - hc, hr);
    if (rows > 1) walk(inside, c0, r0 + hr, hc, rows - hr);
    if (cols > 1 && rows > 1) walk(inside, c0 + hc, r0 + hr, cols - hc, rows - hr);
  };
  walk(
    rings.map((ring) => ({ ring, box: boxOf(ring) })),
    0,
    0,
    COLS,
    ROWS,
  );
}

/** Douglas–Peucker on a closed ring, east–west distances scaled by `kx` (cos latitude). */
function simplify(ring: Ring, tolerance: number, kx: number): Ring {
  const n = ring.length;
  if (n <= 4) return ring;
  const keep = new Uint8Array(n + 1);
  keep[0] = keep[n] = 1;
  // The point farthest from the first splits the ring into two lines.
  const at = (i: number) => ring[i % n]!;
  const stack: Array<[number, number]> = [[0, n]];
  const sq = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop()!;
    const a = at(first);
    const b = at(last);
    const dx = (b[0] - a[0]) * kx;
    const dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    let max = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const p = at(i);
      const px = (p[0] - a[0]) * kx;
      const py = p[1] - a[1];
      let d: number;
      if (len === 0) d = px * px + py * py;
      else {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len));
        d = (px - t * dx) ** 2 + (py - t * dy) ** 2;
      }
      if (d > max) {
        max = d;
        index = i;
      }
    }
    if (index !== -1 && max > sq) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const out: Ring = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[i]!);
  return out;
}

/** Whole numbers of 1/scale degrees, each point after the first as a difference; null if nothing is left. */
function encode(ring: Ring, scale: number): number[] | null {
  const pts: Array<[number, number]> = [];
  for (const [lon, lat] of ring) {
    const x = Math.round(lon * scale);
    const y = Math.round(lat * scale);
    const last = pts[pts.length - 1];
    if (last && last[0] === x && last[1] === y) continue;
    pts.push([x, y]);
  }
  while (
    pts.length > 1 &&
    pts[0]![0] === pts[pts.length - 1]![0] &&
    pts[0]![1] === pts[pts.length - 1]![1]
  )
    pts.pop();
  if (pts.length < 3) return null;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    area += x1 * y2 - x2 * y1;
  }
  if (area === 0) return null;
  const out: number[] = [];
  pts.forEach(([x, y], i) => out.push(i ? x - pts[i - 1]![0] : x, i ? y - pts[i - 1]![1] : y));
  return out;
}

const planarArea = (ring: Ring) => {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
};

async function lakes(): Promise<Array<{ km2: number; rings: Ring[]; name: string }>> {
  const res = await fetch(LAKES_URL);
  if (!res.ok) throw new Error(`Natural Earth lakes download failed: ${res.status}`);
  const geo = (await res.json()) as {
    features: Array<{
      properties: { name?: string | null };
      geometry:
        | { type: 'Polygon'; coordinates: number[][][] }
        | { type: 'MultiPolygon'; coordinates: number[][][][] };
    }>;
  };
  const out: Array<{ km2: number; rings: Ring[]; name: string }> = [];
  for (const f of geo.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys) {
      // The first ring is the shore; the others are islands in the lake.
      const rings = poly.map((r) => r.slice(0, -1).map(([x, y]) => [x!, y!] as [number, number]));
      if (!rings[0] || rings[0].length < 3) continue;
      out.push({ km2: ringAreaKm2(rings[0]), rings, name: f.properties.name ?? '' });
    }
  }
  return out;
}

async function main() {
  const land = await loadOsmLand();
  const water = await lakes();
  const bigLakes = water.filter((l) => l.km2 >= LAKE_MIN_KM2);
  console.log(
    `land: ${land.length} pieces; lakes cut out (≥ ${LAKE_MIN_KM2} km²): ${bigLakes.length} of ${water.length}`,
  );
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const meta = {
    source: `${OSM_LAND_CREDIT}; lakes: Natural Earth 1:10m (public domain)`,
    license: 'ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/)',
    retrieved: new Date().toISOString().slice(0, 10),
  };

  // The whole world, coarse.
  const lowRings = (rings: Ring[], minKm2: number) => {
    const out: number[][] = [];
    for (const ring of rings) {
      if (ringAreaKm2(ring) < minKm2) continue;
      const mid = boxOf(ring);
      const kx = Math.max(0.2, Math.cos((((mid[1] + mid[3]) / 2) * Math.PI) / 180));
      // A ring spanning many latitudes is simplified in plain degrees.
      const enc = encode(
        simplify(ring, LOW.toleranceDeg, mid[3] - mid[1] > 20 ? 1 : kx),
        LOW.scale,
      );
      if (enc) out.push(enc);
    }
    return out;
  };
  const low = {
    ...meta,
    scale: LOW.scale,
    land: lowRings(land.flat(), LOW.minKm2),
    lakes: lowRings(
      water.filter((l) => l.km2 >= LAKE_MIN_KM2_LOW).flatMap((l) => l.rings),
      40,
    ),
  };
  const lowText = JSON.stringify(low);
  await writeFile(path.join(OUT, 'low.json'), lowText);
  const count = (rings: number[][]) => rings.reduce((a, r) => a + r.length / 2, 0);
  console.log(
    `low.json: ${low.land.length} land rings (${count(low.land)} points), ${low.lakes.length} lake rings (${count(low.lakes)} points), ${(lowText.length / 1024).toFixed(0)} KB`,
  );

  // Cells.
  const cells = new Map<number, { land: Ring[]; lakes: Ring[] }>();
  const cell = (c: number, r: number) => {
    const k = r * COLS + c;
    let v = cells.get(k);
    if (!v) cells.set(k, (v = { land: [], lakes: [] }));
    return v;
  };
  intoCells(land.flat(), (c, r, rings) => cell(c, r).land.push(...rings));
  intoCells(
    bigLakes.flatMap((l) => l.rings),
    (c, r, rings) => cell(c, r).lakes.push(...rings),
  );
  const kinds = new Array<string>(COLS * ROWS).fill('0');
  let files = 0;
  let bytes = 0;
  let points = 0;
  const sizes: Array<[number, string]> = [];
  for (const [k, v] of cells) {
    const c = k % COLS;
    const r = Math.floor(k / COLS);
    const south = -90 + r * CELL_DEG;
    const kx = Math.max(0.15, Math.cos(((south + CELL_DEG / 2) * Math.PI) / 180));
    const tol = FINE.toleranceKm / 111.2;
    const pack = (rings: Ring[]) =>
      rings
        .map((ring) => encode(simplify(ring, tol, kx), FINE.scale))
        .filter((x): x is number[] => !!x);
    const landRings = pack(v.land);
    const lakeRings = pack(v.lakes);
    if (!landRings.length) continue;
    const full = (CELL_DEG + 2 * MARGIN) ** 2;
    const whole =
      !lakeRings.length && v.land.length === 1 && Math.abs(planarArea(v.land[0]!) - full) < 1e-7;
    if (whole) {
      kinds[k] = '1';
      continue;
    }
    kinds[k] = '2';
    const text = JSON.stringify({
      scale: FINE.scale,
      land: landRings,
      ...(lakeRings.length ? { lakes: lakeRings } : {}),
    });
    await writeFile(path.join(OUT, `c${c}_${r}.json`), text);
    files++;
    bytes += text.length;
    points += count(landRings) + count(lakeRings);
    sizes.push([text.length, `c${c}_${r}`]);
  }
  await writeFile(
    path.join(OUT, 'cells.json'),
    JSON.stringify({
      ...meta,
      note: 'kinds: one character per cell, west to east then south to north — 0 all sea, 1 all land, 2 see c<x>_<y>.json.',
      level: CELL_LEVEL,
      deg: CELL_DEG,
      cols: COLS,
      rows: ROWS,
      margin: MARGIN,
      kinds: kinds.join(''),
    }),
  );
  sizes.sort((a, b) => b[0] - a[0]);
  console.log(
    `cells of ${CELL_DEG}°: ${files} files, ${points} points, ${(bytes / 1048576).toFixed(1)} MB in all; all land ${kinds.filter((k) => k === '1').length}, all sea ${kinds.filter((k) => k === '0').length}`,
  );
  console.log(
    `largest: ${sizes
      .slice(0, 6)
      .map(([n, name]) => `${name} ${(n / 1024).toFixed(0)} KB`)
      .join(', ')}; median ${(sizes[Math.floor(sizes.length / 2)]![0] / 1024).toFixed(0)} KB`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
