/** Small, dependency-free geographic helpers used on both client and server. */

export type LonLat = [number, number];
export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** True if the point is inside the bbox. Handles bboxes that cross the antimeridian. */
export function bboxContains(b: BBox, lat: number, lon: number): boolean {
  if (lat < b.south || lat > b.north) return false;
  if (b.west <= b.east) return lon >= b.west && lon <= b.east;
  return lon >= b.west || lon <= b.east;
}

export function parseBBox(value: string | null | undefined): BBox | null {
  if (!value) return null;
  const parts = value.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [west, south, east, north] = parts as [number, number, number, number];
  if (south < -90 || north > 90 || south > north) return null;
  if (west < -180 || west > 180 || east < -180 || east > 180) return null;
  return { west, south, east, north };
}

/** Perpendicular distance from p to segment ab in degree space (fine for simplification). */
function segDistSq(p: LonLat, a: LonLat, b: LonLat): number {
  let x = a[0];
  let y = a[1];
  let dx = b[0] - x;
  let dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b[0];
      y = b[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

/** Iterative Douglas–Peucker. `tolerance` is in degrees. Keeps endpoints. */
export function simplifyLine(points: LonLat[], tolerance: number): LonLat[] {
  if (points.length <= 2 || tolerance <= 0) return points.slice();
  const sqTol = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxSq = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segDistSq(points[i]!, points[first]!, points[last]!);
      if (d > maxSq) {
        maxSq = d;
        index = i;
      }
    }
    if (index !== -1 && maxSq > sqTol) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const out: LonLat[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]!);
  return out;
}

/** Simplify a closed ring; returns null if it collapses below a valid ring. */
export function simplifyRing(ring: LonLat[], tolerance: number): LonLat[] | null {
  const s = simplifyLine(ring, tolerance);
  if (s.length < 4) return null;
  const first = s[0]!;
  const last = s[s.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) s.push([first[0], first[1]]);
  return s;
}

type Poly = LonLat[][];
export type PolyGeometry =
  | { type: 'Polygon'; coordinates: Poly }
  | { type: 'MultiPolygon'; coordinates: Poly[] };

/** Simplify a (Multi)Polygon, dropping parts that vanish. Returns null if nothing remains. */
export function simplifyPolygonGeometry(g: PolyGeometry, tolerance: number): PolyGeometry | null {
  const simplifyPoly = (poly: Poly): Poly | null => {
    const outer = poly[0] ? simplifyRing(poly[0], tolerance) : null;
    if (!outer) return null;
    const holes = poly.slice(1).map((r) => simplifyRing(r, tolerance)).filter((r): r is LonLat[] => !!r);
    return [outer, ...holes];
  };
  if (g.type === 'Polygon') {
    const p = simplifyPoly(g.coordinates);
    return p ? { type: 'Polygon', coordinates: p } : null;
  }
  const parts = g.coordinates.map(simplifyPoly).filter((p): p is Poly => !!p);
  return parts.length ? { type: 'MultiPolygon', coordinates: parts } : null;
}

export function geometryBBox(g: PolyGeometry): BBox {
  let west = 180;
  let south = 90;
  let east = -180;
  let north = -90;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of polys)
    for (const ring of poly)
      for (const [lon, lat] of ring) {
        if (lon < west) west = lon;
        if (lon > east) east = lon;
        if (lat < south) south = lat;
        if (lat > north) north = lat;
      }
  return { west, south, east, north };
}

export function countVertices(g: PolyGeometry): number {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  let n = 0;
  for (const poly of polys) for (const ring of poly) n += ring.length;
  return n;
}

/** Round coordinates to `digits` decimals to shrink payloads. */
export function roundGeometry<T extends PolyGeometry>(g: T, digits = 3): T {
  const f = 10 ** digits;
  const r = (v: number) => Math.round(v * f) / f;
  const mapPoly = (poly: Poly): Poly => poly.map((ring) => ring.map(([x, y]) => [r(x), r(y)] as LonLat));
  if (g.type === 'Polygon') return { ...g, coordinates: mapPoly(g.coordinates) };
  return { ...g, coordinates: (g.coordinates as Poly[]).map(mapPoly) } as T;
}

/** Suggested camera altitude (m) to frame a bbox. */
export function altitudeForBBox(b: BBox): number {
  const spanLat = b.north - b.south;
  const spanLon = b.west <= b.east ? b.east - b.west : 360 - (b.west - b.east);
  const span = Math.max(spanLat, spanLon * 0.6);
  return Math.min(20_000_000, Math.max(30_000, span * 111_000 * 1.8));
}

export function bboxCenter(b: BBox): { lat: number; lon: number } {
  const lat = (b.south + b.north) / 2;
  let lon = b.west <= b.east ? (b.west + b.east) / 2 : (b.west + b.east + 360) / 2;
  if (lon > 180) lon -= 360;
  return { lat, lon };
}
