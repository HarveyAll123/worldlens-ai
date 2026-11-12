/**
 * Closed rings from boundary ways. OpenHistoricalMap gives each country the ways that bound it,
 * not a polygon: they share end points and are joined here. Used by the map's Territories
 * layer (apps/web/src/globe/territory.ts) and by the build's corrections (scripts/lib/ohm-patches.ts).
 */

/** A way in a ring: its place in the list given, and whether it runs the way it was drawn. */
export type RingStep = [way: number, forward: boolean];

/** Loose ends this close (degrees, ~6 km) are the same corner mapped twice. */
const JOIN_DEG = 0.06;
/** A boundary left open (an unsettled frontier) is closed straight across a gap up to this share of its length. */
const CLOSE_SHARE = 0.35;

const endKey = (x: number, y: number) => `${x.toFixed(5)},${y.toFixed(5)}`;

interface Chain {
  steps: RingStep[];
  a: [number, number];
  b: [number, number];
  length: number;
}

function lineLength(w: number[]): number {
  let d = 0;
  for (let k = 2; k < w.length; k += 2) d += Math.hypot(w[k]! - w[k - 2]!, w[k + 1]! - w[k - 1]!);
  return d;
}

/**
 * How ways (each a flat [lon, lat, …] line) join into closed rings: for every ring, its ways
 * in order. Ways that share end points are joined; loose ends a few kilometres apart are
 * taken as one; a chain still open is closed straight across if the gap is small beside its
 * length (a frontier nobody had drawn yet), otherwise left out.
 */
export function stitchOrder(ways: Array<number[] | undefined>): RingStep[][] {
  const usable = (i: number) => (ways[i]?.length ?? 0) >= 4;
  const from = (i: number, fwd: boolean): [number, number] => {
    const w = ways[i]!;
    return fwd ? [w[0]!, w[1]!] : [w[w.length - 2]!, w[w.length - 1]!];
  };
  const ends = new Map<string, number[]>();
  for (let i = 0; i < ways.length; i++) {
    if (!usable(i)) continue;
    for (const p of [from(i, true), from(i, false)]) {
      const k = endKey(p[0], p[1]);
      const list = ends.get(k);
      if (list) list.push(i);
      else ends.set(k, [i]);
    }
  }
  const used = new Uint8Array(ways.length);
  const closed: RingStep[][] = [];
  const open: Chain[] = [];
  for (let s = 0; s < ways.length; s++) {
    if (!usable(s) || used[s]) continue;
    used[s] = 1;
    const steps: RingStep[] = [[s, true]];
    const a = from(s, true);
    const start = endKey(a[0], a[1]);
    let b = from(s, false);
    let length = lineLength(ways[s]!);
    while (endKey(b[0], b[1]) !== start) {
      const key = endKey(b[0], b[1]);
      const next = (ends.get(key) ?? []).find((i) => !used[i]);
      if (next === undefined) break;
      used[next] = 1;
      const first = from(next, true);
      const fwd = endKey(first[0], first[1]) === key;
      steps.push([next, fwd]);
      b = from(next, !fwd);
      length += lineLength(ways[next]!);
    }
    if (endKey(b[0], b[1]) === start) closed.push(steps);
    else open.push({ steps, a, b, length });
  }
  const turned = (c: Chain): Chain => ({
    steps: c.steps
      .slice()
      .reverse()
      .map(([w, f]) => [w, !f] as RingStep),
    a: c.b,
    b: c.a,
    length: c.length,
  });
  const gap = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  // Join the two closest loose ends, again and again.
  for (;;) {
    let best = JOIN_DEG;
    let pick: [number, 'a' | 'b', number, 'a' | 'b'] | null = null;
    for (let i = 0; i < open.length; i++)
      for (let j = i; j < open.length; j++)
        for (const ea of ['a', 'b'] as const)
          for (const eb of ['a', 'b'] as const) {
            if (i === j && (ea === eb || ea === 'b')) continue;
            const d = gap(open[i]![ea], open[j]![eb]);
            if (d <= best) {
              best = d;
              pick = [i, ea, j, eb];
            }
          }
    if (!pick) break;
    const [i, ea, j, eb] = pick;
    if (i === j) {
      closed.push(open[i]!.steps);
      open.splice(i, 1);
      continue;
    }
    // The first chain is made to end at the joint, the second to begin there.
    const head = ea === 'b' ? open[i]! : turned(open[i]!);
    const tail = eb === 'a' ? open[j]! : turned(open[j]!);
    open[i] = {
      steps: [...head.steps, ...tail.steps],
      a: head.a,
      b: tail.b,
      length: head.length + tail.length,
    };
    open.splice(j, 1);
  }
  for (const c of open) if (gap(c.a, c.b) <= CLOSE_SHARE * c.length) closed.push(c.steps);
  return closed;
}

/** A ring's points from its ways in order (`of` gives a way's line), closed back to its start. */
export function ringFrom(steps: RingStep[], of: (way: number) => number[]): number[] {
  const ring: number[] = [];
  for (const [i, fwd] of steps) {
    const w = of(i);
    const n = w.length;
    for (let k = 0; k < n; k += 2) {
      const x = fwd ? w[k]! : w[n - 2 - k]!;
      const y = fwd ? w[k + 1]! : w[n - 1 - k]!;
      // Where two ways meet, their shared point is kept once.
      if (k === 0 && ring.length && ring[ring.length - 2] === x && ring[ring.length - 1] === y)
        continue;
      ring.push(x, y);
    }
  }
  if (ring[0] !== ring[ring.length - 2] || ring[1] !== ring[ring.length - 1])
    ring.push(ring[0]!, ring[1]!);
  return ring;
}

/** Closed rings from ways that join end to end; ways that never close are left out. */
export function stitchRings(ways: number[][]): number[][] {
  return stitchOrder(ways)
    .map((steps) => ringFrom(steps, (i) => ways[i]!))
    .filter((ring) => ring.length >= 8);
}

/** Longitudes made continuous along the ring (a ring across the antimeridian runs past ±180). */
export function unwrapRing(ring: number[]): number[] | null {
  const out = ring.slice();
  let shift = 0;
  for (let k = 2; k < out.length; k += 2) {
    const step = ring[k]! - ring[k - 2]!;
    if (step > 180) shift -= 360;
    else if (step < -180) shift += 360;
    out[k] = ring[k]! + shift;
  }
  // A ring round a pole does not come back to where it began: it cannot be filled as it is.
  return Math.abs(out[out.length - 2]! - out[0]!) > 1 ? null : out;
}

export function ringArea(ring: number[]): number {
  let a = 0;
  for (let k = 0; k + 3 < ring.length; k += 2)
    a += ring[k]! * ring[k + 3]! - ring[k + 2]! * ring[k + 1]!;
  return Math.abs(a) / 2;
}
