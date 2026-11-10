/**
 * Marking a place (the assistant's highlight_place): what is drawn — a river's whole course, the
 * coast of a sea or lake, the outline of a desert or range, a ring at a city or peak — and where
 * the camera goes to show all of it.
 */
import { placeShapeId, type PlaceName } from '@worldlens/shared';
import type { PlaceMarkDraw } from '../globe/GeometryLayers';
import type { PlaceMark } from '../state/store';

const KM_PER_DEG = 111.2;
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lon - b.lon) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180)), a.lat - b.lat) *
  KM_PER_DEG;

/**
 * The shapes that are this place: a river's stretches of the same name nearby (the Yangtze is
 * stored in two), an ocean's halves ("North" and "South Pacific Ocean", both the Pacific).
 */
export function markShapeIds(mark: PlaceMark, names: PlaceName[]): string[] {
  const self = names.find((n) => n.id === mark.id);
  const alias = self?.alt;
  const ids = new Set([placeShapeId(mark.id)]);
  for (const n of names) {
    if (n.kind !== mark.kind) continue;
    if (mark.kind === 'r' && n.name === mark.name && km(n, mark) < 2500)
      ids.add(placeShapeId(n.id));
    if (mark.kind === 'o' && alias && (n.alt === alias || n.name === alias))
      ids.add(placeShapeId(n.id));
  }
  return [...ids];
}

/** How close the camera comes for a place without a shape. */
const POINT_KM: Partial<Record<PlaceMark['kind'], number>> = { C: 350, c: 250, p: 120 };

type Bounds = [west: number, south: number, east: number, north: number];
type View = { lat: number; lon: number; altitudeKm: number };

/** A view that shows the whole of `bounds` (or, across the date line, its point from far). */
function viewOf(bounds: Bounds, at: { lat: number; lon: number }): View {
  const [west, south, east, north] = bounds;
  if (east - west > 180) return { lat: at.lat, lon: at.lon, altitudeKm: 9000 };
  const lat = (south + north) / 2;
  const span = Math.max(north - south, (east - west) * Math.cos(lat * (Math.PI / 180)));
  return {
    lat,
    lon: (west + east) / 2,
    altitudeKm: Math.round(Math.min(9000, Math.max(300, span * KM_PER_DEG * 1.8))),
  };
}

export function markDraw(
  mark: PlaceMark,
  names: PlaceName[],
  shapes: Record<string, number[][][]>,
): { draw: PlaceMarkDraw; view: View; bounds: Bounds | null } {
  const point = mark.kind === 'C' || mark.kind === 'c' || mark.kind === 'p';
  const lines = point ? [] : markShapeIds(mark, names).flatMap((id) => shapes[id] ?? []);
  const draw: PlaceMarkDraw = {
    name: mark.name,
    lon: mark.lon,
    lat: mark.lat,
    lines,
    closed: mark.kind !== 'r',
    point: point || lines.length === 0,
  };
  if (lines.length === 0)
    return {
      draw,
      view: { lat: mark.lat, lon: mark.lon, altitudeKm: POINT_KM[mark.kind] ?? 600 },
      bounds: null,
    };
  // Frame every point of the shape.
  const bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const line of lines)
    for (const [lon, lat] of line) {
      bounds[0] = Math.min(bounds[0], lon!);
      bounds[1] = Math.min(bounds[1], lat!);
      bounds[2] = Math.max(bounds[2], lon!);
      bounds[3] = Math.max(bounds[3], lat!);
    }
  return { draw, view: viewOf(bounds, mark), bounds };
}

/** One view for several marks (Lake Victoria and the Sahara together); one mark: its own. */
export function marksView(
  marks: PlaceMark[],
  names: PlaceName[],
  shapes: Record<string, number[][][]>,
): View | null {
  if (marks.length === 0) return null;
  const drawn = marks.map((m) => markDraw(m, names, shapes));
  if (drawn.length === 1) return drawn[0]!.view;
  const all: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  marks.forEach((m, i) => {
    const b = drawn[i]!.bounds ?? [m.lon, m.lat, m.lon, m.lat];
    all[0] = Math.min(all[0], b[0]);
    all[1] = Math.min(all[1], b[1]);
    all[2] = Math.max(all[2], b[2]);
    all[3] = Math.max(all[3], b[3]);
  });
  return viewOf(all, marks[marks.length - 1]!);
}
