/**
 * Checks the reconstructed fronts (packages/shared/src/fronts.ts) for ground they give a side
 * without evidence. No place list is complete; this finds where one is too thin to trust.
 *
 *   pnpm data:audit-fronts [theatre id pattern]        e.g.  pnpm data:audit-fronts ww2-eastern
 *
 * Two checks, each on days spread through the theatre:
 *
 *  1. Unsupported ground. Ground one side is painted as holding inside the other side's
 *     countries, farther than SUPPORT_KM from any place that side holds that day and nearer
 *     to a place the other side holds: the interpolation between far-apart places has run
 *     ahead of the facts (a salient joined to another across country nobody took). Fixed by listing places there — above all places
 *     the advancing side never took.
 *
 *  2. Leave one out. Each listed place is removed in turn and its holder worked out from the
 *     others. Where that is wrong for long, unlisted towns nearby are probably wrong too.
 *
 * Reads the built OpenHistoricalMap files of the web app for the countries of each day.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRONT_THEATRES, isLand } from '../packages/shared/src/data/fronts/index';
import {
  controlAreas,
  dayToMs,
  heldByA,
  holderAt,
  unnamed,
  type FrontTheatre,
} from '../packages/shared/src/fronts';
import type { LonLat } from '../packages/shared/src/geo';
import { ringFrom, stitchOrder, unwrapRing } from '../packages/shared/src/rings';

const here = path.dirname(fileURLToPath(import.meta.url));
const OHM = path.resolve(here, '../apps/web/public/data/ohm');
const want = new RegExp(process.argv[2] ?? '.', 'i');
const SUPPORT_KM = Number(process.env.SUPPORT_KM ?? 70);
const STEP_DEG = Number(process.env.STEP_DEG ?? 0.2);
const DAYS = Number(process.env.DAYS ?? 36);
const EVERY_DAYS = Number(process.env.EVERY_DAYS ?? 7);
const LIST = Number(process.env.LIST ?? 12);

type Row = [string, string, string | null, string | null, unknown, number[], number[], number?];
const index = JSON.parse(await readFile(path.join(OHM, 'polities.json'), 'utf8')) as {
  polities: Row[];
  carried?: Row[];
};
const coarse = (
  JSON.parse(await readFile(path.join(OHM, 'ways-coarse.json'), 'utf8')) as { ways: number[][] }
).ways;
const rows = [...index.polities, ...(index.carried ?? [])];
const ringsOf = new Map<Row, number[][]>();
function rings(row: Row): number[][] {
  let r = ringsOf.get(row);
  if (!r) {
    let acc = 0;
    const lines = row[6].map((d) => coarse[(acc += d)]);
    r = stitchOrder(lines)
      .map((steps) => ringFrom(steps, (i) => lines[i]!))
      .filter((ring) => ring.length >= 8)
      .map(unwrapRing)
      .filter((x): x is number[] => !!x);
    ringsOf.set(row, r);
  }
  return r;
}
const inRings = (list: number[][], x: number, y: number) => {
  let hit = false;
  for (const r of list)
    for (let k = 0; k + 3 < r.length; k += 2) {
      const [x1, y1, x2, y2] = [r[k]!, r[k + 1]!, r[k + 2]!, r[k + 3]!];
      if (y1 > y !== y2 > y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) hit = !hit;
    }
  return hit;
};
const inPoly = (poly: LonLat[], x: number, y: number) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[j]!;
    if (y1 > y !== y2 > y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) hit = !hit;
  }
  return hit;
};
const iso = (day: number) => new Date(dayToMs(day)).toISOString().slice(0, 10);
const km = (lon1: number, lat1: number, lon2: number, lat2: number) =>
  Math.hypot((lon1 - lon2) * Math.cos((lat1 * Math.PI) / 180), lat1 - lat2) * 111.2;

function unsupported(t: FrontTheatre): string[] {
  const reA = new RegExp(t.politiesA, 'i');
  const reB = new RegExp(t.politiesB, 'i');
  const lons = t.places.map((p) => p.lon);
  const lats = t.places.map((p) => p.lat);
  const [w, e] = [Math.min(...lons) - 2, Math.max(...lons) + 2];
  const s = Math.min(...lats) - 1.5;
  if (e - w > 200) return []; // a theatre across the antimeridian: not gridded here
  const hits = new Map<string, { n: number; at: string; far: number; from: string; to: string }>();
  const cellKm2 = (lat: number) => (STEP_DEG * 111.2) ** 2 * Math.cos((lat * Math.PI) / 180);
  // Often: a salient may last a month.
  const steps = Math.max(DAYS, Math.ceil((t.end - t.start) / EVERY_DAYS));
  for (let i = 0; i <= steps; i++) {
    const day = t.start + ((t.end - t.start) * (i + 0.5)) / (steps + 1);
    const date = iso(day);
    const { a, b } = controlAreas(t, day, isLand);
    const active = rows.filter((r) => r[1] <= date && (!r[2] || r[2] > date));
    const ownA = active.filter((r) => reA.test(r[0]));
    const ownB = active.filter((r) => reB.test(r[0]));
    for (const [held, own, side, isA] of [
      [a, ownB, t.sideA, true],
      [b, ownA, t.sideB, false],
    ] as const) {
      if (!held.length || !own.length) continue;
      const holders = t.places.filter((p) => !p.neutral && heldByA(p, day) === isA);
      const others = t.places.filter((p) => !p.neutral && heldByA(p, day) !== isA);
      // Rows of the grid each polygon covers.
      const marked = new Set<number>();
      const cols = Math.ceil((e - w) / STEP_DEG);
      for (const poly of held) {
        let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
        for (const [x, y] of poly) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
        for (let r = Math.ceil((y0 - s) / STEP_DEG); r <= Math.floor((y1 - s) / STEP_DEG); r++)
          for (let c = Math.ceil((x0 - w) / STEP_DEG); c <= Math.floor((x1 - w) / STEP_DEG); c++) {
            const key = r * cols + c;
            if (marked.has(key)) continue;
            if (inPoly(poly, w + c * STEP_DEG, s + r * STEP_DEG)) marked.add(key);
          }
      }
      for (const key of marked) {
        const lon = w + (key % cols) * STEP_DEG;
        const lat = s + Math.floor(key / cols) * STEP_DEG;
        if (!isLand(lon, lat)) continue;
        let best = Infinity;
        let nearest = '';
        for (const p of holders) {
          const d = km(lon, lat, p.lon, p.lat);
          if (d < best) {
            best = d;
            nearest = p.name;
          }
        }
        if (best <= SUPPORT_KM) continue;
        // … and nearer to a place the other side holds: the evidence at hand says otherwise.
        if (!others.some((p) => km(lon, lat, p.lon, p.lat) < best)) continue;
        const where = own.find((r) => inRings(rings(r), lon, lat));
        if (!where) continue;
        const label = `${side.split(/[ ,(]/)[0]} ${Math.round(best / 50) * 50}+ km beyond ${unnamed({ name: nearest } as never) ? 'a line pin' : nearest} (in ${where[0]})`;
        const v = hits.get(label) ?? { n: 0, at: '', far: 0, from: date, to: date };
        v.n += cellKm2(lat);
        if (best > v.far) {
          v.far = best;
          v.at = `${lat.toFixed(1)},${lon.toFixed(1)}`;
        }
        v.to = date;
        hits.set(label, v);
      }
    }
  }
  return [...hits]
    .sort((p, q) => q[1].n - p[1].n)
    .slice(0, LIST)
    .map(
      ([label, v]) =>
        `    ${label}: ${Math.round(v.n / 100) / 10}k km²·samples, worst at ${v.at} (${Math.round(v.far)} km), ${v.from} to ${v.to}`,
    );
}

function leaveOneOut(t: FrontTheatre): { summary: string; rows: string[] } {
  const named = t.places.filter((p) => !p.neutral && !unnamed(p));
  let checks = 0;
  let wrong = 0;
  const bad: Array<{ name: string; falseA: number; falseB: number; none: number; when: string }> =
    [];
  const days = Array.from(
    { length: DAYS + 1 },
    (_, i) => t.start + ((t.end - t.start) * (i + 0.5)) / (DAYS + 1),
  );
  for (const p of named) {
    const without: FrontTheatre = { ...t, places: t.places.filter((q) => q !== p) };
    let [falseA, falseB, none] = [0, 0, 0];
    let when = '';
    for (const day of days) {
      const truth = heldByA(p, day) ? 'a' : 'b';
      const guess = holderAt(without, day, p.lon, p.lat, isLand);
      checks++;
      if (guess === truth) continue;
      if (guess === null) none++;
      else {
        wrong++;
        if (guess === 'a') falseA++;
        else falseB++;
        when ||= iso(day);
      }
    }
    if (falseA + falseB) bad.push({ name: p.name, falseA, falseB, none, when });
  }
  const share = (n: number) => `${Math.round((100 * n) / (DAYS + 1))}%`;
  return {
    summary: `${named.length} places; the others get a place wrong ${((100 * wrong) / Math.max(1, checks)).toFixed(1)}% of the time`,
    rows: bad
      .sort((p, q) => q.falseA + q.falseB - (p.falseA + p.falseB))
      .slice(0, LIST)
      .map(
        (v) =>
          `    ${v.name}: ${v.falseA ? `given to ${t.sideA.split(/[ ,(]/)[0]} ${share(v.falseA)} of the time when not held` : ''}${v.falseA && v.falseB ? '; ' : ''}${v.falseB ? `taken from it ${share(v.falseB)} of the time when held` : ''} (first ${v.when})`,
      ),
  };
}

for (const t of FRONT_THEATRES) {
  if (!want.test(t.id)) continue;
  const far = unsupported(t);
  const loo = process.env.LOO === '0' ? null : leaveOneOut(t);
  console.log(`\n${t.id} — ${t.name}${loo ? `: ${loo.summary}` : ''}`);
  if (far.length)
    console.log(
      `  ground more than ${SUPPORT_KM} km from any place its holder holds:\n${far.join('\n')}`,
    );
  else console.log('  no unsupported ground');
  if (loo?.rows.length) console.log(`  places the others get wrong:\n${loo.rows.join('\n')}`);
}
