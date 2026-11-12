/**
 * The theatres whose front lines are reconstructed day by day (../../fronts.ts), built by
 * `pnpm data:fronts` from scripts/fronts/, and what the globe and the assistant ask of them.
 * Kept out of the main entry points: the web app loads it only when frontlines are shown.
 */
import {
  controlAreas,
  dayNumber,
  dayToMs,
  frontAt,
  landTestFrom,
  recentChanges,
  theatreActive,
  type FrontPlace,
  type FrontTheatre,
  type LandMaskData,
} from '../../fronts';
import type { LonLat } from '../../geo';
import type { Frontline } from '../../schemas';
import landMask from './land-mask.json';
import { OCCUPATIONS, type Occupation } from './occupations';
import theatresJson from './theatres.json';

export { OCCUPATIONS, type Occupation } from './occupations';

type RawPlace = [string, number, number, Array<[number, number]>, 1?];
type RawTheatre = Omit<FrontTheatre, 'places'> & { places: RawPlace[] };

export const FRONT_THEATRES: FrontTheatre[] = (
  theatresJson as unknown as { theatres: RawTheatre[] }
).theatres.map((t) => ({
  ...t,
  places: t.places.map(([name, lat, lon, held, neutral]): FrontPlace => ({
    name,
    lat,
    lon,
    held,
    ...(neutral ? { neutral: true } : {}),
  })),
}));

/** True on land (Natural Earth 1:10m land, public domain, at a quarter of a degree). */
export const isLand = landTestFrom(landMask as LandMaskData);

const isoDay = (day: number) => new Date(dayToMs(day)).toISOString().slice(0, 10);

export const FRONT_METHOD =
  'Reconstructed by WorldLens from the dates places changed hands: exact where and when a listed place was taken or retaken, interpolated in between. Approximate, never survey-grade.';
export const FRONT_LICENSE = 'WorldLens compilation; coordinates Wikidata (CC0)';

/** The fronts in being at a moment, as frontline records the globe can draw. */
export function reconstructedFrontlines(ms: number, conflictId?: string): Frontline[] {
  const day = dayNumber(ms);
  const out: Frontline[] = [];
  for (const t of FRONT_THEATRES) {
    if (conflictId && t.conflictId !== conflictId) continue;
    if (!theatreActive(t, day)) continue;
    const { lines } = frontAt(t, day, isLand);
    if (!lines.length) continue;
    out.push({
      id: `front-${t.id}`,
      conflictId: t.conflictId,
      name: t.name,
      geometry: {
        type: 'MultiLineString',
        coordinates: lines.map((line) =>
          line.map(([lon, lat]) => [Math.round(lon * 1000) / 1000, Math.round(lat * 1000) / 1000]),
        ),
      },
      validFrom: isoDay(t.start),
      validTo: isoDay(t.end),
      datePrecision: 'day',
      certainty: 'RECONSTRUCTED',
      sideA: t.sideA,
      sideB: t.sideB,
      disputed: false,
      confidence: 0.6,
      source: `WorldLens reconstruction from ${t.places.length} places with dated changes of hands (${t.war})`,
      license: FRONT_LICENSE,
      notes: FRONT_METHOD,
    });
  }
  return out;
}

/**
 * The ground each side holds in every theatre with a front at a moment, for colouring the
 * map (the web app's Territories layer).
 */
export function controlAt(
  ms: number,
): Array<{ theatre: FrontTheatre; a: LonLat[][]; b: LonLat[][] }> {
  const day = dayNumber(ms);
  return [
    // Occupations first: a front that moves over the same ground is painted over them.
    ...occupationsAt(ms).map((o) => ({
      theatre: asTheatre(o),
      a: o.boxes.map(([w, s, e, n]): LonLat[] => [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
      ]),
      b: [],
    })),
    ...FRONT_THEATRES.filter((t) => theatreActive(t, day)).map((theatre) => ({
      theatre,
      ...controlAreas(theatre, day, isLand),
    })),
  ];
}

/** Occupations in force at a moment (./occupations.ts). */
export function occupationsAt(ms: number): Occupation[] {
  const iso = new Date(ms).toISOString().slice(0, 10);
  return OCCUPATIONS.filter((o) => o.from <= iso && iso < o.to);
}

const theatreOf = new Map<Occupation, FrontTheatre>();
/** An occupation in a theatre's clothes: the occupier is side A, holding the boxes. */
function asTheatre(o: Occupation): FrontTheatre {
  let t = theatreOf.get(o);
  if (!t) {
    t = {
      id: o.id,
      name: o.name,
      war: o.war,
      conflictId: o.conflictId,
      sideA: o.occupier,
      sideB: o.occupied,
      start: dayNumber(Date.parse(o.from)),
      end: dayNumber(Date.parse(o.to)),
      horizonDays: 1,
      maxEdgeKm: 0,
      clipToLand: true,
      places: [],
      colorA: o.color,
      colorB: o.color,
      politiesA: '^$',
      politiesB: o.polities,
      sources: o.sources,
      ...(o.note ? { note: o.note } : {}),
    };
    theatreOf.set(o, t);
  }
  return t;
}

/** What the assistant can say about the occupations in force at a moment. */
export function occupationBriefs(
  ms: number,
  conflictId?: string,
): Array<{
  name: string;
  occupier: string;
  occupied: string;
  from: string;
  to: string;
  note?: string;
}> {
  return occupationsAt(ms)
    .filter((o) => !conflictId || o.conflictId === conflictId)
    .map((o) => ({
      name: o.name,
      occupier: o.occupier,
      occupied: o.occupied,
      from: o.from,
      to: o.to,
      ...(o.note ? { note: o.note } : {}),
    }));
}

export interface FrontBrief {
  id: string;
  name: string;
  war: string;
  conflict_id: string;
  side_a: string;
  side_b: string;
  from: string;
  to: string;
  certainty: 'RECONSTRUCTED';
  /** Places beside the line on each side, in order along it. */
  held_by_side_a_near_the_line: string[];
  held_by_side_b_near_the_line: string[];
  changed_hands_in_the_last_30_days: Array<{ place: string; date: string; taken_by: string }>;
  method: string;
  sources: string[];
}

/** At most `n` of the names, spread evenly over the list. */
function spread(names: string[], n: number): string[] {
  if (names.length <= n) return names;
  return Array.from(
    { length: n },
    (_, i) => names[Math.round((i * (names.length - 1)) / (n - 1))]!,
  );
}

/** What the assistant can say about each front at a moment (no geometry). */
export function frontBriefs(ms: number, conflictId?: string): FrontBrief[] {
  const day = dayNumber(ms);
  const out: FrontBrief[] = [];
  for (const t of FRONT_THEATRES) {
    if (conflictId && t.conflictId !== conflictId) continue;
    if (!theatreActive(t, day)) continue;
    const { lines, alongA, alongB } = frontAt(t, day, isLand);
    if (!lines.length) continue;
    // North to south, or west to east where the front runs that way.
    const all = [...alongA, ...alongB].map((i) => t.places[i]!);
    const lats = all.map((p) => p.lat);
    const lons = all.map((p) => p.lon);
    const tall =
      Math.max(...lats) - Math.min(...lats) >=
      (Math.max(...lons) - Math.min(...lons)) * Math.cos((lats[0]! * Math.PI) / 180);
    const order = (idx: number[]) =>
      idx
        .map((i) => t.places[i]!)
        .sort((a, b) => (tall ? b.lat - a.lat : a.lon - b.lon))
        .map((p) => p.name);
    out.push({
      id: `front-${t.id}`,
      name: t.name,
      war: t.war,
      conflict_id: t.conflictId,
      side_a: t.sideA,
      side_b: t.sideB,
      from: isoDay(t.start),
      to: isoDay(t.end),
      certainty: 'RECONSTRUCTED',
      held_by_side_a_near_the_line: spread(order(alongA), 16),
      held_by_side_b_near_the_line: spread(order(alongB), 16),
      changed_hands_in_the_last_30_days: recentChanges(t, day, 30)
        .slice(0, 12)
        .map((c) => ({
          place: c.place,
          date: isoDay(c.day),
          taken_by: c.to === 'a' ? t.sideA : t.sideB,
        })),
      method: FRONT_METHOD,
      sources: t.sources,
    });
  }
  return out;
}

/** Theatres of a conflict, or all: what exists, for "is there a front line for …". */
export function frontTheatreList(
  conflictId?: string,
): Array<{ id: string; name: string; war: string; conflict_id: string; from: string; to: string }> {
  return FRONT_THEATRES.filter((t) => !conflictId || t.conflictId === conflictId).map((t) => ({
    id: `front-${t.id}`,
    name: t.name,
    war: t.war,
    conflict_id: t.conflictId,
    from: isoDay(t.start),
    to: isoDay(t.end),
  }));
}
