/**
 * A land mask for clipping reconstructed front lines to land (packages/shared/src/fronts.ts),
 * from Natural Earth 1:10m land polygons with its great lakes taken out (public domain): a
 * front does not run across Lake Ladoga.
 *
 *   pnpm data:land-mask
 *
 * Output (committed):
 *   packages/shared/src/data/fronts/land-mask.json —
 *     { res, rows }: one string per row of `res`° cells, south to north; each row is run lengths
 *     in base 36 joined by ".", sea first. A cell is land when at least a quarter of it is, so
 *     lines along a coast are kept and open water is not.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLandMask } from './lib/land-mask';
import { ringAreaKm2, type Ring } from './lib/osm-land';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../packages/shared/src/data/fronts/land-mask.json');
const RES = 0.1;
const SAMPLES = 8;
/** Lakes of at least this size are water to a front line. */
const LAKE_MIN_KM2 = 900;
const NE_COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19';
const LAKES_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_COMMIT}/geojson/ne_10m_lakes.geojson`;

const mask = await loadLandMask();
const w = Math.round(360 / RES);
const h = Math.round(180 / RES);
const land = new Uint8Array(w * h);
for (let r = 0; r < h; r++)
  for (let c = 0; c < w; c++) {
    let hits = 0;
    for (let i = 0; i < SAMPLES; i++)
      for (let j = 0; j < SAMPLES; j++)
        if (
          mask.at(-180 + (c + (i + 0.5) / SAMPLES) * RES, -90 + (r + (j + 0.5) / SAMPLES) * RES) > 0
        )
          hits++;
    if (hits >= (SAMPLES * SAMPLES) / 4) land[r * w + c] = 1;
  }

// The great lakes: cells whose centre lies in one (and not on an island of it).
const res = await fetch(LAKES_URL);
if (!res.ok) throw new Error(`Natural Earth lakes download failed: ${res.status}`);
const geo = (await res.json()) as {
  features: Array<{
    geometry:
      | { type: 'Polygon'; coordinates: number[][][] }
      | { type: 'MultiPolygon'; coordinates: number[][][][] };
  }>;
};
const inRing = (ring: Ring, x: number, y: number) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[j]!;
    if (y1 > y !== y2 > y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) hit = !hit;
  }
  return hit;
};
let lakes = 0;
let drowned = 0;
for (const f of geo.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    const rings = poly.map((r) => r.map(([x, y]) => [x!, y!] as [number, number]));
    const shore = rings[0];
    if (!shore || ringAreaKm2(shore) < LAKE_MIN_KM2) continue;
    lakes++;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of shore) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    for (let r = Math.floor((y0 + 90) / RES); r <= Math.floor((y1 + 90) / RES); r++)
      for (let c = Math.floor((x0 + 180) / RES); c <= Math.floor((x1 + 180) / RES); c++) {
        const x = -180 + (c + 0.5) * RES;
        const y = -90 + (r + 0.5) * RES;
        if (!land[r * w + c] || !inRing(shore, x, y)) continue;
        if (rings.slice(1).some((island) => inRing(island, x, y))) continue;
        land[r * w + c] = 0;
        drowned++;
      }
  }
}

const rows: string[] = [];
let landCells = 0;
for (let r = 0; r < h; r++) {
  const runs: number[] = [];
  let run = 0;
  let on = false;
  for (let c = 0; c < w; c++) {
    const isLand = land[r * w + c] === 1;
    if (isLand) landCells++;
    if (isLand === on) run++;
    else {
      runs.push(run);
      run = 1;
      on = isLand;
    }
  }
  // The last run is implied by the row's width; a row of water only is an empty string.
  if (on) runs.push(run);
  rows.push(runs.length ? runs.map((n) => n.toString(36)).join('.') : '');
}
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify({ res: RES, rows })}\n`);
console.log(
  `land mask: ${w}×${h} cells of ${RES}°, ${((100 * landCells) / (w * h)).toFixed(1)}% land; ${lakes} lakes of ${LAKE_MIN_KM2}+ km² taken out (${drowned} cells) → ${OUT}`,
);
