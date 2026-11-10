/**
 * Place names on the globe (Natural Earth, scripts/build-place-names.ts): cities, oceans and
 * seas, lakes, rivers, mountain ranges and peaks, deserts and other landforms. Shared by the web
 * app (labels, marking a place) and the API (the assistant's highlight_place finds them by name).
 */

/** C capital · c city · o ocean · s sea, gulf, bay or strait · l lake · r river · m range · p peak · d desert · f landform · i island */
export type PlaceKindCode = 'C' | 'c' | 'o' | 's' | 'l' | 'r' | 'm' | 'p' | 'd' | 'f' | 'i';

/** The kinds the assistant names ("river", "mountain"), each covering one or more codes. */
export const PLACE_GROUPS = [
  'city',
  'river',
  'lake',
  'sea',
  'ocean',
  'mountain',
  'desert',
  'landform',
  'island',
] as const;
export type PlaceGroup = (typeof PLACE_GROUPS)[number];

export const PLACE_KIND: Record<PlaceKindCode, { label: string; group: PlaceGroup }> = {
  C: { label: 'capital city', group: 'city' },
  c: { label: 'city', group: 'city' },
  o: { label: 'ocean', group: 'ocean' },
  s: { label: 'sea', group: 'sea' },
  l: { label: 'lake', group: 'lake' },
  r: { label: 'river', group: 'river' },
  m: { label: 'mountain range', group: 'mountain' },
  p: { label: 'mountain', group: 'mountain' },
  d: { label: 'desert', group: 'desert' },
  f: { label: 'landform', group: 'landform' },
  i: { label: 'island', group: 'island' },
};

export type PlaceNameRaw = [
  id: string,
  name: string,
  lat: number,
  lon: number,
  minZoom: number,
  kind: PlaceKindCode,
  alt?: string,
];

export interface PlaceName {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Web-map zoom from which Natural Earth labels it (lower: more prominent). */
  minZoom: number;
  kind: PlaceKindCode;
  /** Another name it goes by ("Nyanza" for Lake Victoria). */
  alt?: string;
}

export function decodePlaceNames(raw: { places: PlaceNameRaw[] }): PlaceName[] {
  return raw.places.map(([id, name, lat, lon, minZoom, kind, alt]) => ({
    id,
    name,
    lat,
    lon,
    minZoom,
    kind,
    ...(alt ? { alt } : {}),
  }));
}

/** The shape a place is drawn with when marked: rivers share theirs across label points. */
export const placeShapeId = (id: string) => id.split('.')[0]!;

/** "Río Grande" → "rio grande". */
export function normalizePlaceName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Words that say what a place is, not which: "the Nile River" is the Nile. */
const GENERIC =
  /\b(the|river|rio|r|lake|lac|loch|mount|mt|mountains|mts|mountain|range|sea|ocean|gulf|bay|desert|city|island|islands)\b/g;
const core = (s: string) => normalizePlaceName(s).replace(GENERIC, ' ').replace(/\s+/g, ' ').trim();

/**
 * Places a name may mean, best first: the exact name (or another it goes by), then the same
 * without words like "river" or "mount", then names starting with it ("Amazon" → "Amazonas");
 * within each, the most prominent (Natural Earth labels it first) leads.
 */
export function findPlaceNames(
  places: PlaceName[],
  query: string,
  group: PlaceGroup | 'any' = 'any',
): PlaceName[] {
  const q = normalizePlaceName(query);
  const qc = core(query);
  if (!q) return [];
  const pool = group === 'any' ? places : places.filter((p) => PLACE_KIND[p.kind].group === group);
  const names = (p: PlaceName) => (p.alt ? [p.name, p.alt] : [p.name]);
  const tiers: ((p: PlaceName) => boolean)[] = [
    (p) => names(p).some((n) => normalizePlaceName(n) === q),
    // "the Nile River" is the Nile itself before it is the "Mountain Nile".
    (p) => !!qc && names(p).some((n) => normalizePlaceName(n) === qc),
    (p) => !!qc && names(p).some((n) => core(n) === qc),
    (p) => qc.length >= 3 && names(p).some((n) => core(n).startsWith(qc)),
  ];
  for (const tier of tiers) {
    const hits = pool.filter(tier);
    if (hits.length)
      return hits.sort(
        (a, b) => a.minZoom - b.minZoom || (a.kind === 'C' ? -1 : 0) - (b.kind === 'C' ? -1 : 0),
      );
  }
  return [];
}
