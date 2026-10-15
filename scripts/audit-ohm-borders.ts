/**
 * Audits the dated borders (apps/web/public/data/ohm) on every date where OpenHistoricalMap
 * records a change, plus 1 January of every year since 1800.
 *
 *   pnpm data:audit-borders
 *
 * A "broken end" is the end of a drawn border line that stops inland — not at the coast and
 * not on another drawn border. A complete border network has none; each one is a visible gap
 * (a neighbour missing from OHM, or a border not drawn). Lines drawn at sea are also counted.
 * Reports the old rule (shared ways only) against the current rule, per decade, and the worst
 * dates with the polities around their gaps.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeOn, landBorders, parseOhmIndex, type OhmPolity } from '../apps/web/src/globe/ohm';
import { loadLandMask, type LandMask } from './lib/land-mask';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(here, '../apps/web/public/data/ohm');
const TOUCH = 0.03; // degrees: a line end this close to another drawn line is connected
const GRID = 0.25;

interface Result {
  day: string;
  drawn: number;
  broken: number;
  atSea: number;
  around: Map<string, number>;
}

function audit(
  day: string,
  active: OhmPolity[],
  drawn: number[],
  coarse: number[][],
  classes: string,
  mask: LandMask,
): Result {
  const grid = new Map<string, Array<{ w: number; k: number }>>();
  const cell = (x: number, y: number) => `${Math.floor(x / GRID)},${Math.floor(y / GRID)}`;
  for (const w of drawn) {
    const c = coarse[w]!;
    for (let k = 0; k + 3 < c.length; k += 2) {
      const xs = [c[k]!, c[k + 2]!];
      const ys = [c[k + 1]!, c[k + 3]!];
      for (
        let gx = Math.floor((Math.min(...xs) - TOUCH) / GRID);
        gx <= Math.floor((Math.max(...xs) + TOUCH) / GRID);
        gx++
      )
        for (
          let gy = Math.floor((Math.min(...ys) - TOUCH) / GRID);
          gy <= Math.floor((Math.max(...ys) + TOUCH) / GRID);
          gy++
        ) {
          if (Math.abs(xs[0]! - xs[1]!) > 90) continue;
          const key = `${gx},${gy}`;
          const list = grid.get(key);
          if (list) list.push({ w, k });
          else grid.set(key, [{ w, k }]);
        }
    }
  }
  const dist = (px: number, py: number, s: number[], k: number) => {
    const dx = s[k + 2]! - s[k]!;
    const dy = s[k + 3]! - s[k + 1]!;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((px - s[k]!) * dx + (py - s[k + 1]!) * dy) / len)) : 0;
    return Math.hypot(px - (s[k]! + t * dx), py - (s[k + 1]! + t * dy));
  };
  const ownerName = new Map<number, string>();
  for (const p of active) for (const w of p.ways) if (!ownerName.has(w)) ownerName.set(w, p.name);
  let broken = 0;
  const around = new Map<string, number>();
  for (const w of drawn) {
    const c = coarse[w]!;
    if (c.length < 4) continue;
    const ends: Array<[number, number]> = [
      [c[0]!, c[1]!],
      [c[c.length - 2]!, c[c.length - 1]!],
    ];
    if (ends[0]![0] === ends[1]![0] && ends[0]![1] === ends[1]![1]) continue; // closed ring
    for (const [x, y] of ends) {
      if (mask.at(x, y) !== 2) continue; // ends at (or near) the coast
      const touches = (grid.get(cell(x, y)) ?? []).some(
        (e) => e.w !== w && dist(x, y, coarse[e.w]!, e.k) <= TOUCH,
      );
      if (touches) continue;
      broken++;
      const name = ownerName.get(w) ?? '?';
      around.set(name, (around.get(name) ?? 0) + 1);
    }
  }
  const atSea = drawn.filter((w) => classes[w] === '0').length;
  return { day, drawn: drawn.length, broken, atSea, around };
}

async function main() {
  const index = parseOhmIndex(JSON.parse(await readFile(path.join(DIR, 'polities.json'), 'utf8')));
  const { ways: coarse, classes } = JSON.parse(
    await readFile(path.join(DIR, 'ways-coarse.json'), 'utf8'),
  ) as { ways: number[][]; classes: string };
  const mask = await loadLandMask();
  const today = new Date().toISOString().slice(0, 10);
  const days = new Set<string>();
  for (let y = 1800; y <= Number(today.slice(0, 4)); y++) days.add(`${y}-01-01`);
  for (const p of index.polities)
    for (const d of [p.start, p.end])
      if (d && d >= '1800' && d <= today)
        days.add(d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d);
  const sorted = [...days].sort();

  const before: Result[] = [];
  const after: Result[] = [];
  for (const day of sorted) {
    const active = activeOn(index.polities, day);
    before.push(audit(day, active, landBorders(active), coarse, classes, mask));
    after.push(audit(day, active, landBorders(active, coarse, classes), coarse, classes, mask));
  }

  const sum = (rs: Result[], f: (r: Result) => number) => rs.reduce((a, r) => a + f(r), 0);
  console.log(`dates audited: ${sorted.length} (${sorted[0]} → ${sorted[sorted.length - 1]})`);
  console.log(
    `broken ends per date — shared-only rule: ${(sum(before, (r) => r.broken) / before.length).toFixed(1)} avg; current rule: ${(sum(after, (r) => r.broken) / after.length).toFixed(1)} avg`,
  );
  console.log(`lines drawn at sea (current rule): ${sum(after, (r) => r.atSea)} across all dates`);
  console.log('\ndecade   dates  broken(avg) shared-only → current');
  for (let d = 1800; d <= Number(today.slice(0, 4)); d += 10) {
    const pick = (rs: Result[]) =>
      rs.filter((r) => Number(r.day.slice(0, 4)) >= d && Number(r.day.slice(0, 4)) < d + 10);
    const b = pick(before);
    const a = pick(after);
    if (!a.length) continue;
    console.log(
      `${d}s   ${String(a.length).padStart(5)}   ${(sum(b, (r) => r.broken) / b.length).toFixed(1).padStart(6)} → ${(sum(a, (r) => r.broken) / a.length).toFixed(1).padStart(5)}`,
    );
  }
  // Where the remaining gaps are: polities most often next to a broken end.
  const where = new Map<string, number>();
  for (const r of after) for (const [n, c] of r.around) where.set(n, (where.get(n) ?? 0) + c);
  console.log('\npolities most often next to a remaining gap (summed over dates):');
  for (const [n, c] of [...where].sort((x, y) => y[1] - x[1]).slice(0, 25))
    console.log(`  ${c}\t${n}`);
  // Accuracy today: OHM borders against Natural Earth's 1:10m land boundaries (independent).
  const ne = JSON.parse(
    await readFile(path.resolve(here, '../apps/web/public/data/borders-10m.json'), 'utf8'),
  ) as { features: Array<{ geometry: { coordinates: number[][][] } }> };
  const nowActive = activeOn(index.polities, today);
  const ohmLines = landBorders(nowActive, coarse, classes).map((w) => coarse[w]!);
  const neLines = ne.features.flatMap((f) => f.geometry.coordinates.map((part) => part.flat()));
  const within = (from: number[][], to: number[][], tol: number) => {
    const grid = new Map<string, number[][]>();
    const key = (x: number, y: number) => `${Math.floor(x / 0.25)},${Math.floor(y / 0.25)}`;
    for (const line of to)
      for (let k = 0; k + 3 < line.length; k += 2) {
        const seg = [line[k]!, line[k + 1]!, line[k + 2]!, line[k + 3]!];
        for (
          let gx = Math.floor((Math.min(seg[0]!, seg[2]!) - tol) / 0.25);
          gx <= Math.floor((Math.max(seg[0]!, seg[2]!) + tol) / 0.25);
          gx++
        )
          for (
            let gy = Math.floor((Math.min(seg[1]!, seg[3]!) - tol) / 0.25);
            gy <= Math.floor((Math.max(seg[1]!, seg[3]!) + tol) / 0.25);
            gy++
          ) {
            if (Math.abs(seg[0]! - seg[2]!) > 90) continue;
            const kk = `${gx},${gy}`;
            const list = grid.get(kk);
            if (list) list.push(seg);
            else grid.set(kk, [seg]);
          }
      }
    let total = 0;
    let close = 0;
    for (const line of from)
      for (let k = 0; k + 3 < line.length; k += 2) {
        const len = Math.hypot(line[k + 2]! - line[k]!, line[k + 3]! - line[k + 1]!);
        if (len > 90) continue;
        const mx = (line[k]! + line[k + 2]!) / 2;
        const my = (line[k + 1]! + line[k + 3]!) / 2;
        total += len;
        const near = (grid.get(key(mx, my)) ?? []).some((sg) => {
          const dx = sg[2]! - sg[0]!;
          const dy = sg[3]! - sg[1]!;
          const l2 = dx * dx + dy * dy;
          const t = l2
            ? Math.max(0, Math.min(1, ((mx - sg[0]!) * dx + (my - sg[1]!) * dy) / l2))
            : 0;
          return Math.hypot(mx - (sg[0]! + t * dx), my - (sg[1]! + t * dy)) <= tol;
        });
        if (near) close += len;
      }
    return (100 * close) / Math.max(1e-9, total);
  };
  console.log(
    `\naccuracy on ${today} vs Natural Earth 1:10m (within ~5 km): ${within(ohmLines, neLines, 0.05).toFixed(1)}% of drawn OHM border length matches a Natural Earth border; ${within(neLines, ohmLines, 0.05).toFixed(1)}% of Natural Earth's land borders are drawn`,
  );

  // Historical cross-check: OHM against the historical-basemaps world snapshots (GPL-3.0,
  // fetched for this comparison only — never stored). Those maps are world-scale, so agreement
  // is measured at ~25 km. Disagreement points at either source; the polities listed are where
  // OHM draws lines the snapshot does not have.
  const BASEMAPS =
    'https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@da7a4b735ecef70aebdc9c73e409d8a2500d50f3/geojson/';
  console.log(
    '\nyear  OHM lines matching snapshot  snapshot land borders drawn by OHM   (≤ ~25 km)',
  );
  for (const year of [
    1800, 1815, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010,
  ]) {
    const res = await fetch(`${BASEMAPS}world_${year}.geojson`);
    if (!res.ok) continue;
    const snap = (await res.json()) as {
      features: Array<{
        geometry: { type: string; coordinates: number[][][] | number[][][][] } | null;
      }>;
    };
    const snapLines: number[][] = [];
    for (const f of snap.features) {
      if (!f.geometry) continue;
      const polys = (
        f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
      ) as number[][][][];
      for (const poly of polys)
        for (const ring of poly) {
          // Keep inland stretches only (snapshot coastlines are not borders).
          let cur: number[] = [];
          for (const [x, y] of ring as number[][]) {
            if (mask.at(x!, y!) === 2) cur.push(x!, y!);
            else {
              if (cur.length >= 4) snapLines.push(cur);
              cur = [];
            }
          }
          if (cur.length >= 4) snapLines.push(cur);
        }
    }
    const day = `${year}-07-01`;
    const act = activeOn(index.polities, day);
    const drawn = landBorders(act, coarse, classes);
    const lines = drawn.map((w) => coarse[w]!);
    console.log(
      `${year}  ${within(lines, snapLines, 0.25).toFixed(1).padStart(6)}%                       ${within(snapLines, lines, 0.25).toFixed(1).padStart(6)}%`,
    );
  }

  console.log('\nworst dates (current rule):');
  for (const r of [...after].sort((x, y) => y.broken - x.broken).slice(0, 12))
    console.log(
      `  ${r.day}  ${r.broken} broken ends — ${[...r.around]
        .sort((x, y) => y[1] - x[1])
        .slice(0, 5)
        .map(([n, c]) => `${n} (${c})`)
        .join(', ')}`,
    );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
