/**
 * Front lines that move with the date, reconstructed rather than drawn.
 *
 * No open dataset records where the fronts of past wars ran day by day. What is recorded, and
 * checkable, is when places changed hands (Minsk: taken 28 June 1941, retaken 3 July 1944). A
 * theatre here is a list of such places with the periods one side held them. For any moment
 * the front is the line between the places that side holds and those it does not:
 *
 *  - each place gets a level: positive while side A holds it, negative otherwise, growing with
 *    the time since (or until) it changed hands and capped at the theatre's horizon — so a
 *    line moves toward a place in the weeks before it falls, crosses it on the day, and comes
 *    to rest half-way to the next place still held;
 *  - the levels are interpolated over a triangulation of the places (Delaunay) and the zero
 *    contour is the front; an encircled place gets a ring around it;
 *  - triangles with a very long side are left out (no line across ground with no places),
 *    and what falls in the sea is clipped away.
 *
 * The result is a reconstruction (certainty RECONSTRUCTED): exact where and when a listed
 * place changed hands, an interpolation in between. It is never survey-grade.
 */

import type { LonLat } from './geo';

export interface FrontPlace {
  name: string;
  lat: number;
  lon: number;
  /** Periods side A held the place: [from, to) in days since 1970-01-01 UTC. */
  held: Array<[number, number]>;
  /**
   * In a country that took no part (Switzerland beside the Western Front): no front and no
   * control is worked out across it.
   */
  neutral?: boolean;
}

export interface FrontTheatre {
  id: string;
  /** "Eastern Front". */
  name: string;
  /** "World War II". */
  war: string;
  conflictId: string;
  sideA: string;
  sideB: string;
  /** The front exists from `start` to `end` (days since 1970-01-01 UTC). */
  start: number;
  end: number;
  /** Days around a place changing hands during which the line moves toward or past it. */
  horizonDays: number;
  /** Triangles with a longer side are skipped. */
  maxEdgeKm: number;
  /** False for island wars, whose line is a perimeter at sea. */
  clipToLand: boolean;
  places: FrontPlace[];
  /**
   * For colouring the map by who held the ground: each side's colour (a key of the web app's
   * palette, e.g. "germany") and the countries of the time that were its own, as a
   * case-insensitive pattern on their names. Ground side A holds inside side B's countries
   * is shown in A's colour, and the reverse.
   */
  colorA: string;
  colorB: string;
  politiesA: string;
  politiesB: string;
  /** Where the dates can be checked. */
  sources: string[];
  note?: string;
}

/** True where a point is on land. */
export type LandTest = (lon: number, lat: number) => boolean;

const DAY_MS = 86_400_000;
/** Days since 1970-01-01 UTC (fractional: hours count). */
export const dayNumber = (ms: number) => ms / DAY_MS;
export const dayToMs = (day: number) => day * DAY_MS;

/** Whether the theatre has a front at this moment. */
export const theatreActive = (t: FrontTheatre, day: number) => day >= t.start && day <= t.end;

/** A point set along a line of known course (its name starts with "~"): never listed. */
export const unnamed = (place: FrontPlace) => place.name.startsWith('~');

/** Whether side A holds a place at this moment. */
export function heldByA(place: FrontPlace, day: number): boolean {
  return place.held.some(([from, to]) => day >= from && day < to);
}

const MIN_LEVEL = 0.02;

/**
 * A place's level in [-1, 1]: positive while side A holds it. Its size is the time since or
 * until the nearest change of hands, as a share of the horizon.
 */
export function placeLevel(place: FrontPlace, day: number, horizonDays: number): number {
  let inside = Infinity;
  let outside = Infinity;
  for (const [from, to] of place.held) {
    if (day >= from && day < to) inside = Math.min(inside, day - from, to - day);
    else outside = Math.min(outside, day < from ? from - day : day - to);
  }
  if (inside !== Infinity) return Math.max(MIN_LEVEL, Math.min(1, inside / horizonDays));
  return -Math.max(MIN_LEVEL, Math.min(1, outside / horizonDays));
}

/* ------------------------------------------------------------------ triangulation */

interface Mesh {
  /** Longitudes unwrapped around the theatre's middle (so a theatre may span 180°). */
  lon: number[];
  lat: number[];
  /**
   * The place each point takes its level from: itself, or — for the points added off the
   * coast (see `meshOf`) — the coastal place they stand out from.
   */
  src: number[];
  /** Triangles (indices of points) with no side longer than the theatre allows. */
  triangles: Array<[number, number, number]>;
}

/**
 * Per theatre: the plain mesh, the one carried offshore (for the line), and the one carried
 * outward all round (for the ground each side holds).
 */
const meshes = new WeakMap<FrontTheatre, { padded?: Mesh; plain?: Mesh; skirted?: Mesh }>();

/** Delaunay triangulation (Bowyer–Watson) of points in a plane. */
export function delaunay(x: number[], y: number[]): Array<[number, number, number]> {
  const n = x.length;
  if (n < 3) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i]!);
    maxX = Math.max(maxX, x[i]!);
    minY = Math.min(minY, y[i]!);
    maxY = Math.max(maxY, y[i]!);
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  // A deterministic nudge (a millionth of the span) keeps collinear and repeated points apart.
  const px = x.map((v, i) => v + span * 1e-6 * Math.sin(i * 12.9898));
  const py = y.map((v, i) => v + span * 1e-6 * Math.cos(i * 78.233));
  px.push(midX - 30 * span, midX, midX + 30 * span);
  py.push(midY - span, midY + 30 * span, midY - span);

  interface Tri {
    a: number;
    b: number;
    c: number;
    cx: number;
    cy: number;
    r2: number;
  }
  const make = (a: number, b: number, c: number): Tri => {
    const ax = px[a]!;
    const ay = py[a]!;
    const bx = px[b]! - ax;
    const by = py[b]! - ay;
    const cx = px[c]! - ax;
    const cy = py[c]! - ay;
    const d = 2 * (bx * cy - by * cx);
    if (Math.abs(d) < 1e-18) return { a, b, c, cx: ax, cy: ay, r2: Infinity };
    const b2 = bx * bx + by * by;
    const c2 = cx * cx + cy * cy;
    const ux = (cy * b2 - by * c2) / d;
    const uy = (bx * c2 - cx * b2) / d;
    return { a, b, c, cx: ax + ux, cy: ay + uy, r2: ux * ux + uy * uy };
  };

  let tris: Tri[] = [make(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const edges = new Map<string, [number, number]>();
    const keep: Tri[] = [];
    for (const t of tris) {
      const dx = px[i]! - t.cx;
      const dy = py[i]! - t.cy;
      if (dx * dx + dy * dy < t.r2) {
        for (const [u, v] of [
          [t.a, t.b],
          [t.b, t.c],
          [t.c, t.a],
        ] as Array<[number, number]>) {
          const key = u < v ? `${u}_${v}` : `${v}_${u}`;
          // An edge shared by two removed triangles is inside the hole: not on its rim.
          if (edges.has(key)) edges.delete(key);
          else edges.set(key, [u, v]);
        }
      } else keep.push(t);
    }
    for (const [u, v] of edges.values()) keep.push(make(u, v, i));
    tris = keep;
  }
  return tris.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => [t.a, t.b, t.c]);
}

const KM_PER_DEG = 111.2;
/** How far off the coast, or beyond the outermost places, the mesh is carried (see `meshOf`). */
const OFFSHORE_KM = 110;
/** Where that would be on land, the ground is carried only this far (and the line not at all). */
const ONSHORE_KM = 40;
/** Along a long outer edge the mesh is carried outward at points this far apart. */
const SKIRT_STEP_KM = 90;

/** Indices of the points on the convex hull, counter-clockwise (Andrew's monotone chain). */
function convexHull(x: number[], y: number[], use: number[]): number[] {
  const pts = [...use].sort((a, b) => x[a]! - x[b]! || y[a]! - y[b]!);
  if (pts.length < 3) return pts;
  const cross = (o: number, a: number, b: number) =>
    (x[a]! - x[o]!) * (y[b]! - y[o]!) - (y[a]! - y[o]!) * (x[b]! - x[o]!);
  const half = (list: number[]) => {
    const out: number[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0)
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(pts), ...half(pts.reverse())];
}

/**
 * The theatre's triangulation. Places on the edge of it that face the sea get a twin a little
 * way offshore, holding whatever they hold: without it the ground beyond the last town — a
 * cape, a coast between two ports — would belong to no triangle, and a front would stop short
 * of the shore. (What lies in the sea is clipped or never painted.)
 *
 * For the ground each side holds (`skirt`) the mesh is carried outward all the way round, on
 * land too, and along its long outer edges: every stretch of country within reach of the
 * outermost places is then on one side or the other, as the nearest of them is — a peninsula
 * beyond the last town listed is not left out. The line itself is not drawn out there.
 */
function meshOf(theatre: FrontTheatre, land?: LandTest, skirt = false): Mesh {
  const slot = !land ? 'plain' : skirt ? 'skirted' : 'padded';
  const cached = meshes.get(theatre)?.[slot];
  if (cached) return cached;
  const places = theatre.places;
  // The middle longitude, on a circle (a theatre can straddle the antimeridian).
  let sx = 0;
  let sy = 0;
  let lat0 = 0;
  for (const p of places) {
    sx += Math.cos((p.lon * Math.PI) / 180);
    sy += Math.sin((p.lon * Math.PI) / 180);
    lat0 += p.lat / places.length;
  }
  const lon0 = (Math.atan2(sy, sx) * 180) / Math.PI;
  // For the ground each side holds, neutral places are left out altogether: they keep the
  // *line* out of a neutral country, but ground beside one (the French Jura along the Swiss
  // frontier) is still somebody's.
  const src = places.map((_, i) => i).filter((i) => !(skirt && places[i]!.neutral));
  const lon = src.map((i) => lon0 + ((((places[i]!.lon - lon0) % 360) + 540) % 360) - 180);
  const lat = src.map((i) => places[i]!.lat);
  const k = Math.cos((lat0 * Math.PI) / 180);
  const x = lon.map((v) => (v - lon0) * k * KM_PER_DEG);
  const y = lat.map((v) => (v - lat0) * KM_PER_DEG);
  const neutral = (i: number) => places[src[i]!]!.neutral === true;
  const real = x.length;
  if (land && (skirt || theatre.clipToLand)) {
    const hull = convexHull(
      x,
      y,
      x.map((_, i) => i).filter((i) => !neutral(i)),
    );
    // A twin of mesh point `from`, out from (bx, by) along the unit vector (ux, uy).
    const twin = (bx: number, by: number, ux: number, uy: number, from: number) => {
      const at = (km: number) => {
        const gx = bx + ux * km;
        const gy = by + uy * km;
        return { gx, gy, glon: lon0 + gx / (k * KM_PER_DEG), glat: lat0 + gy / KM_PER_DEG };
      };
      let g = at(OFFSHORE_KM);
      if (land(g.glon, g.glat)) {
        // Land out there: the line is not carried over it at all, and the ground only a
        // little way — beyond the last place known, nothing says how far a side reached.
        if (!skirt) return;
        g = at(ONSHORE_KM);
      }
      lon.push(g.glon);
      lat.push(g.glat);
      x.push(g.gx);
      y.push(g.gy);
      src.push(src[from]!);
    };
    const unit = (dx: number, dy: number) => {
      const len = Math.hypot(dx, dy) || 1;
      return [dy / len, -dx / len] as const;
    };
    for (let h = 0; h < hull.length && hull.length >= 3; h++) {
      const prev = hull[(h + hull.length - 1) % hull.length]!;
      const at = hull[h]!;
      const next = hull[(h + 1) % hull.length]!;
      // Outward: the sum of the two edges' outward normals (the hull runs counter-clockwise).
      const n1 = unit(x[at]! - x[prev]!, y[at]! - y[prev]!);
      const n2 = unit(x[next]! - x[at]!, y[next]! - y[at]!);
      const len = Math.hypot(n1[0] + n2[0], n1[1] + n2[1]) || 1;
      twin(x[at]!, y[at]!, (n1[0] + n2[0]) / len, (n1[1] + n2[1]) / len, at);
      if (!skirt) continue;
      // Along the edge to the next: each point outward of it takes after the place nearest
      // to it — often one inside the edge, not either of its ends.
      const dx = x[next]! - x[at]!;
      const dy = y[next]! - y[at]!;
      const steps = Math.floor(Math.hypot(dx, dy) / SKIRT_STEP_KM);
      for (let j = 1; j <= steps; j++) {
        const t = j / (steps + 1);
        const bx = x[at]! + t * dx;
        const by = y[at]! + t * dy;
        let nearest = at;
        let best = Infinity;
        for (let i = 0; i < real; i++) {
          if (neutral(i)) continue;
          const d = (x[i]! - bx) ** 2 + (y[i]! - by) ** 2;
          if (d < best) {
            best = d;
            nearest = i;
          }
        }
        twin(bx, by, n2[0], n2[1], nearest);
      }
    }
  }
  const far = (i: number, j: number) =>
    Math.hypot(x[i]! - x[j]!, y[i]! - y[j]!) > theatre.maxEdgeKm;
  const triangles = delaunay(x, y).filter(
    ([a, b, c]) =>
      !far(a, b) && !far(b, c) && !far(c, a) && !neutral(a) && !neutral(b) && !neutral(c),
  );
  const mesh = { lon, lat, src, triangles };
  meshes.set(theatre, { ...meshes.get(theatre), [slot]: mesh });
  return mesh;
}

/* ------------------------------------------------------------------ the line */

const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Corner cutting (Chaikin): rounds a polyline while keeping its ends. */
function smooth(line: LonLat[], closed: boolean, times: number): LonLat[] {
  let pts = line;
  for (let n = 0; n < times; n++) {
    if (pts.length < 3) break;
    const out: LonLat[] = [];
    const count = closed ? pts.length : pts.length - 1;
    if (!closed) out.push(pts[0]!);
    for (let i = 0; i < count; i++) {
      const p = pts[i]!;
      const q = pts[(i + 1) % pts.length]!;
      out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]]);
      out.push([0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
    }
    if (!closed) out.push(pts[pts.length - 1]!);
    pts = out;
  }
  return closed && pts.length ? [...pts, pts[0]!] : pts;
}

function lengthKm(line: LonLat[]): number {
  let km = 0;
  for (let i = 1; i < line.length; i++) {
    const [x1, y1] = line[i - 1]!;
    const [x2, y2] = line[i]!;
    km += Math.hypot((x2 - x1) * Math.cos((((y1 + y2) / 2) * Math.PI) / 180), y2 - y1) * KM_PER_DEG;
  }
  return km;
}

export interface FrontState {
  /** The front's lines, each a list of [lon, lat]. */
  lines: LonLat[][];
  /** Places beside the line, on either side (indices into the theatre's places). */
  alongA: number[];
  alongB: number[];
}

/**
 * The theatre's front at a moment (days since 1970-01-01 UTC; fractions are hours). Empty
 * outside the theatre's dates.
 */
export function frontAt(theatre: FrontTheatre, day: number, land?: LandTest): FrontState {
  if (!theatreActive(theatre, day)) return { lines: [], alongA: [], alongB: [] };
  const mesh = meshOf(theatre, land);
  const own = theatre.places.map((p) => placeLevel(p, day, theatre.horizonDays));
  const level = mesh.src.map((i) => own[i]!);
  // Where the line crosses each edge between a place held and one not, and which crossings
  // each connects to (an edge is shared by at most two triangles: at most two links).
  const nodes = new Map<string, { at: LonLat; links: string[]; ends: [number, number] }>();
  const crossing = (i: number, j: number): string => {
    const key = i < j ? `${i}_${j}` : `${j}_${i}`;
    if (!nodes.has(key)) {
      const f = level[i]! / (level[i]! - level[j]!);
      nodes.set(key, {
        at: [
          mesh.lon[i]! + f * (mesh.lon[j]! - mesh.lon[i]!),
          mesh.lat[i]! + f * (mesh.lat[j]! - mesh.lat[i]!),
        ],
        links: [],
        ends: [i, j],
      });
    }
    return key;
  };
  for (const [a, b, c] of mesh.triangles) {
    const pa = level[a]! > 0;
    const pb = level[b]! > 0;
    const pc = level[c]! > 0;
    if (pa === pb && pb === pc) continue;
    // The vertex on its own side, and the two edges from it that the line crosses.
    const [lone, u, v] = pa === pb ? [c, a, b] : pa === pc ? [b, a, c] : [a, b, c];
    const k1 = crossing(lone, u);
    const k2 = crossing(lone, v);
    nodes.get(k1)!.links.push(k2);
    nodes.get(k2)!.links.push(k1);
  }

  const seen = new Set<string>();
  const walk = (start: string): { line: LonLat[]; closed: boolean } => {
    const line: LonLat[] = [];
    let prev: string | null = null;
    let at: string | null = start;
    let closed = false;
    while (at && !seen.has(at)) {
      seen.add(at);
      const node: { at: LonLat; links: string[] } = nodes.get(at)!;
      line.push(node.at);
      const next: string | undefined = node.links.find((l) => l !== prev && !seen.has(l));
      if (!next && node.links.length === 2 && node.links.includes(start) && line.length > 2)
        closed = true;
      prev = at;
      at = next ?? null;
    }
    return { line, closed };
  };
  const raw: Array<{ line: LonLat[]; closed: boolean }> = [];
  for (const [key, node] of nodes)
    if (node.links.length === 1 && !seen.has(key)) raw.push(walk(key));
  for (const key of nodes.keys()) if (!seen.has(key)) raw.push(walk(key));

  const lines: LonLat[][] = [];
  for (const { line, closed } of raw) {
    if (line.length < 2) continue;
    const rounded = smooth(line, closed, 2).map(([x, y]): LonLat => [wrapLon(x), y]);
    if (!land || !theatre.clipToLand) {
      lines.push(rounded);
      continue;
    }
    let part: LonLat[] = [];
    const flush = () => {
      if (part.length >= 2 && lengthKm(part) >= 12) lines.push(part);
      part = [];
    };
    for (const p of rounded) {
      if (land(p[0], p[1])) part.push(p);
      else flush();
    }
    flush();
  }
  // The places beside the line: the two ends of every crossing that is on the map.
  const alongA = new Set<number>();
  const alongB = new Set<number>();
  const clip = !!land && theatre.clipToLand;
  for (const node of nodes.values()) {
    if (clip && !land!(node.at[0], node.at[1])) continue;
    for (const i of node.ends) {
      const place = mesh.src[i]!;
      if (!unnamed(theatre.places[place]!)) (level[i]! > 0 ? alongA : alongB).add(place);
    }
  }
  return { lines, alongA: [...alongA], alongB: [...alongB] };
}

/**
 * The ground each side holds inside the theatre at a moment, as small polygons (the mesh's
 * triangles, cut along the front) of [lon, lat]; longitudes run on from the theatre's middle,
 * so they may pass ±180. Not clipped to land: the map paints them only over countries.
 */
export function controlAreas(
  theatre: FrontTheatre,
  day: number,
  land?: LandTest,
): { a: LonLat[][]; b: LonLat[][] } {
  const a: LonLat[][] = [];
  const b: LonLat[][] = [];
  if (!theatreActive(theatre, day)) return { a, b };
  const mesh = meshOf(theatre, land, true);
  const own = theatre.places.map((p) => placeLevel(p, day, theatre.horizonDays));
  const level = mesh.src.map((i) => own[i]!);
  const at = (i: number): LonLat => [mesh.lon[i]!, mesh.lat[i]!];
  const cut = (i: number, j: number): LonLat => {
    const f = level[i]! / (level[i]! - level[j]!);
    return [
      mesh.lon[i]! + f * (mesh.lon[j]! - mesh.lon[i]!),
      mesh.lat[i]! + f * (mesh.lat[j]! - mesh.lat[i]!),
    ];
  };
  for (const [i, j, k] of mesh.triangles) {
    const pi = level[i]! > 0;
    const pj = level[j]! > 0;
    const pk = level[k]! > 0;
    if (pi === pj && pj === pk) {
      (pi ? a : b).push([at(i), at(j), at(k)]);
      continue;
    }
    const [lone, u, v] = pi === pj ? [k, i, j] : pi === pk ? [j, i, k] : [i, j, k];
    const c1 = cut(lone, u);
    const c2 = cut(lone, v);
    const loneIsA = level[lone]! > 0;
    (loneIsA ? a : b).push([at(lone), c1, c2]);
    (loneIsA ? b : a).push([at(u), at(v), c2, c1]);
  }
  return { a, b };
}

/**
 * Which side holds a point at a moment, as the map paints it: 'a', 'b', or null where the
 * theatre has nothing to say (out of its reach, or not its dates).
 */
export function holderAt(
  theatre: FrontTheatre,
  day: number,
  lon: number,
  lat: number,
  land?: LandTest,
): 'a' | 'b' | null {
  const areas = controlAreas(theatre, day, land);
  const inside = (poly: LonLat[], x: number) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [x1, y1] = poly[i]!;
      const [x2, y2] = poly[j]!;
      if (y1 > lat !== y2 > lat && x < x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1)) hit = !hit;
    }
    return hit;
  };
  // The areas' longitudes run on from the theatre's middle: try the point a turn either way.
  for (const x of [lon, lon + 360, lon - 360]) {
    if (areas.a.some((poly) => inside(poly, x))) return 'a';
    if (areas.b.some((poly) => inside(poly, x))) return 'b';
  }
  return null;
}

/** Places that are held by a different side at `dayB` than at `dayA`. */
export function changesBetween(
  theatre: FrontTheatre,
  dayA: number,
  dayB: number,
): { toA: string[]; toB: string[] } {
  const toA: string[] = [];
  const toB: string[] = [];
  for (const p of theatre.places) {
    if (unnamed(p)) continue;
    const before = heldByA(p, dayA);
    const after = heldByA(p, dayB);
    if (before !== after) (after ? toA : toB).push(p.name);
  }
  return { toA, toB };
}

/** Places that changed hands within `days` before the moment, latest first. */
export function recentChanges(
  theatre: FrontTheatre,
  day: number,
  days: number,
): Array<{ place: string; day: number; to: 'a' | 'b' }> {
  const out: Array<{ place: string; day: number; to: 'a' | 'b' }> = [];
  for (const p of theatre.places)
    for (const [from, to] of unnamed(p) ? [] : p.held) {
      if (from > theatre.start && from <= day && from > day - days)
        out.push({ place: p.name, day: from, to: 'a' });
      if (to < theatre.end && to <= day && to > day - days)
        out.push({ place: p.name, day: to, to: 'b' });
    }
  return out.sort((a, b) => b.day - a.day);
}

/* ------------------------------------------------------------------ land mask */

export interface LandMaskData {
  /** Cell size in degrees. */
  res: number;
  /** One string per row, south to north: run lengths in base 36, sea first, joined by ".". */
  rows: string[];
}

/** A land test from the run-length mask (packages/shared/src/data/fronts/land-mask.json). */
export function landTestFrom(mask: LandMaskData): LandTest {
  const w = Math.round(360 / mask.res);
  const h = mask.rows.length;
  const bits = new Uint8Array(w * h);
  mask.rows.forEach((row, r) => {
    if (!row) return;
    let x = 0;
    let land = false;
    for (const run of row.split('.')) {
      const len = parseInt(run, 36);
      if (land) bits.fill(1, r * w + x, r * w + x + len);
      x += len;
      land = !land;
    }
  });
  const lat0 = -(h * mask.res) / 2;
  return (lon, lat) => {
    const r = Math.floor((lat - lat0) / mask.res);
    if (r < 0 || r >= h) return false;
    const c = Math.floor((wrapLon(lon) + 180) / mask.res) % w;
    return bits[r * w + c] === 1;
  };
}
